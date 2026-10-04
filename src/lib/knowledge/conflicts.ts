import "server-only";
import { hasLLM, llmJSON } from "../llm";
import { db, mutate, uid } from "../store";
import type { DB, Guardrail, Page, PageConflict, PageItem, PageList } from "../types";
import { regenerateLessons } from "./lessons";

// Knowledge changes. When a session adds something to a page that contradicts
// what the page already says, appending both would leave a page that argues
// with itself — and a live rule built on the old version keeps firing. After
// every save the page is checked:
//   changed      the world changed (a supplier left the blacklist): the newer
//                statement wins, the older items move to "superseded" with who
//                said what and when, rules built on the old fact switch off —
//                and a person is asked to confirm.
//   disagreement two experts describe the same situation differently: nobody
//                wins, the page is marked disputed and its contested rules pause
//                until someone decides.
//   exception    narrower, not contradicting ("except leasing"): stays as is.

const LISTS: PageList[] = ["recognize", "steps", "why", "guardrails", "edgeCases"];
type Entry = { list: PageList; item: PageItem | Guardrail };

const entries = (p: Page): Entry[] => LISTS.flatMap((list) => (p[list] as (PageItem | Guardrail)[]).map((item) => ({ list, item })));
const who = (d: DB, id?: string) => d.people.find((x) => x.id === id)?.name ?? id ?? "someone";
const bySession = (it: PageItem | Guardrail, sessionId: string) => it.provenance.some((x) => x.sessionId === sessionId);

interface Found {
  kind: "changed" | "disagreement" | "exception";
  summary: string;
  olderIds: string[];
  newerIds: string[];
  ruleOffIds?: string[];
  title?: string;
  situation?: string;
  triggerText?: string;
  clearTriggers?: boolean;
}

const SYSTEM = `You keep an accounts-payable knowledge page consistent. A new session (the "newer" items) was just merged into a page that already held "older" items from earlier sessions. Find every place where newer items CONTRADICT older ones — not where they merely add detail. For each contradiction:
- kind "changed": the facts changed over time (a supplier was removed from a blacklist, an approver changed, a threshold was raised). The newer statement is the current truth.
- kind "disagreement": both describe the same, current situation but differ (two experts handle it differently) and nothing says one is outdated.
- kind "exception": the newer item only narrows the older one ("except leasing", "unless approved") — both stay valid.
Return the older item ids that are no longer true (olderIds) and the newer item ids that state the new truth (newerIds). An older guardrail whose TEXT is still true in general but whose machine rule encodes the outdated fact (e.g. a condition naming a supplier that is no longer blacklisted) goes in ruleOffIds instead of olderIds.
If the page title, its situation description or the "when this applies" text states the outdated fact, propose a corrected title / situation / triggerText that states the lasting rule, not the changing list (e.g. "Invoices from blacklisted suppliers go on hold"); set clearTriggers when the machine trigger only matched the outdated fact.
summary: one sentence a reviewer reads, naming who said what (e.g. "Sabine: Schmidt Logistik KG is blacklisted → Thomas: removed from the blacklist").
Return an empty list when nothing contradicts. Write in English.`;

const SCHEMA = {
  type: "object",
  properties: {
    conflicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["changed", "disagreement", "exception"] },
          summary: { type: "string" },
          olderIds: { type: "array", items: { type: "string" } },
          newerIds: { type: "array", items: { type: "string" } },
          ruleOffIds: { type: "array", items: { type: "string" } },
          title: { type: "string" },
          situation: { type: "string" },
          triggerText: { type: "string" },
          clearTriggers: { type: "boolean" },
        },
        required: ["kind", "summary", "olderIds", "newerIds"],
      },
    },
  },
  required: ["conflicts"],
};

/** Compare what `sessionId` added to a page with what the page held before, and apply what was found. */
export async function checkConflicts(pageId: string, sessionId: string): Promise<PageConflict[]> {
  const d = db();
  const p = d.pages.find((x) => x.id === pageId);
  if (!p || !hasLLM()) return [];
  const all = entries(p);
  const newer = all.filter((e) => bySession(e.item, sessionId));
  const older = all.filter((e) => !bySession(e.item, sessionId));
  if (!newer.length || !older.length) return [];
  const view = (e: Entry) => ({
    id: e.item.id,
    section: e.list,
    text: e.item.text,
    rule: "rule" in e.item ? e.item.rule : undefined,
    said_by: [...new Set(e.item.provenance.map((x) => who(d, x.personId)))],
    when: e.item.provenance.map((x) => x.ts).filter(Boolean).map((t) => new Date(t!).toISOString().slice(0, 10))[0],
    quote: e.item.provenance.find((x) => x.quote)?.quote,
  });
  const out = await llmJSON<{ conflicts: Found[] }>({
    system: SYSTEM,
    prompt: JSON.stringify({ page: { title: p.title, situation: p.situation, triggerText: p.triggerText, triggers: p.triggers }, older: older.map(view), newer: newer.map(view) }),
    schema: SCHEMA,
    name: "page_conflicts",
    maxTokens: 2000,
  }).catch((e) => (console.warn("[conflicts]", (e as Error).message), { conflicts: [] as Found[] }));

  const ids = new Set(all.map((e) => e.item.id));
  const found = out.conflicts
    .filter((c) => c.kind !== "exception")
    .map((c) => ({ ...c, olderIds: c.olderIds.filter((i) => ids.has(i)), newerIds: c.newerIds.filter((i) => ids.has(i)), ruleOffIds: (c.ruleOffIds ?? []).filter((i) => ids.has(i)) }))
    .filter((c) => c.olderIds.length || c.ruleOffIds.length);
  if (!found.length) return [];
  return applyConflicts(pageId, sessionId, found);
}

function applyConflicts(pageId: string, sessionId: string, found: Found[]): PageConflict[] {
  return mutate((d) => {
    const p = d.pages.find((x) => x.id === pageId)!;
    const s = d.sessions.find((x) => x.id === sessionId);
    const newBy = who(d, s?.personId);
    const now = Date.now();
    const made: PageConflict[] = [];
    for (const f of found) {
      const live = entries(p);
      const text = (i: string) => live.find((e) => e.item.id === i)?.item.text ?? "";
      const c: PageConflict = {
        id: uid("C-"),
        kind: f.kind as PageConflict["kind"],
        status: f.kind === "changed" ? "review" : "disputed",
        at: now,
        summary: f.summary,
        older: { by: [...new Set(f.olderIds.concat(f.ruleOffIds ?? []).flatMap((i) => live.find((e) => e.item.id === i)?.item.provenance.map((x) => who(d, x.personId)) ?? []))], itemIds: f.olderIds, texts: f.olderIds.map(text) },
        newer: { by: newBy, sessionId, itemIds: f.newerIds, texts: f.newerIds.map(text) },
        before: { title: p.title, situation: p.situation, triggers: p.triggers, triggerText: p.triggerText },
      };
      if (f.kind === "changed") {
        retire(p, c.id, f.olderIds, newBy, `superseded by ${newBy}: ${f.summary}`);
        c.rulesOff = [];
        for (const g of p.guardrails.filter((x) => f.ruleOffIds?.includes(x.id) && x.rule)) {
          c.rulesOff.push({ guardrailId: g.id, rule: g.rule! });
          delete g.rule;
        }
        if (f.title) p.title = f.title;
        if (f.situation) p.situation = f.situation;
        if (f.triggerText) p.triggerText = f.triggerText;
        if (f.clearTriggers) p.triggers = [];
      } else {
        p.status = "disputed";
      }
      (p.conflicts ??= []).push(c);
      made.push(c);
      p.version++;
      p.updatedAt = now;
      p.history.push({
        version: p.version, at: now, by: newBy, sessionId,
        summary: f.kind === "changed"
          ? `Changed: ${f.summary} — newer version applied, ${f.olderIds.length} item(s) superseded${c.rulesOff?.length ? `, ${c.rulesOff.length} rule(s) off` : ""}; needs review`
          : `Disputed: ${f.summary} — rules paused until someone decides`,
      });
    }
    regenerateLessons(d, [p.id]);
    return made;
  });
}

/** Move live items into "superseded" (kept, attributed, restorable). */
function retire(p: Page, conflictId: string, itemIds: string[], by: string, reason: string) {
  for (const list of LISTS) {
    const items = p[list] as (PageItem | Guardrail)[];
    for (const it of items.filter((x) => itemIds.includes(x.id))) (p.superseded ??= []).push({ list, item: it, conflictId, at: Date.now(), by, reason });
    (p[list] as (PageItem | Guardrail)[]) = items.filter((x) => !itemIds.includes(x.id));
  }
}

/** Bring items superseded by this conflict back into the live page. */
function restore(p: Page, conflictId: string, itemIds: string[]) {
  const back = (p.superseded ?? []).filter((x) => x.conflictId === conflictId && itemIds.includes(x.item.id));
  for (const x of back) (p[x.list] as (PageItem | Guardrail)[]).push(x.item);
  p.superseded = (p.superseded ?? []).filter((x) => !back.includes(x));
}

/**
 * A person decides. keep_new: the newer statement stands (older items stay superseded).
 * keep_old: the change is undone (older back, newer superseded, title and rules restored).
 * both: both are true in different cases (older items and rules come back).
 */
export function resolveConflict(pageId: string, conflictId: string, resolution: "keep_new" | "keep_old" | "both", by = "Reviewer") {
  return mutate((d) => {
    const p = d.pages.find((x) => x.id === pageId);
    const c = p?.conflicts?.find((x) => x.id === conflictId);
    if (!p || !c || c.status === "resolved") return null;
    const reviewer = d.people.find((x) => x.id === by)?.name ?? by;
    if (resolution === "keep_new" && c.kind === "disagreement") retire(p, c.id, c.older.itemIds, reviewer, `${reviewer} kept ${c.newer.by}'s version`);
    if (resolution === "keep_old" || resolution === "both") {
      restore(p, c.id, c.older.itemIds);
      for (const r of c.rulesOff ?? []) {
        const g = p.guardrails.find((x) => x.id === r.guardrailId);
        if (g && !g.rule) g.rule = r.rule;
      }
    }
    if (resolution === "keep_old") {
      retire(p, c.id, c.newer.itemIds, reviewer, `${reviewer} kept the earlier version`);
      if (c.before) Object.assign(p, c.before);
    }
    c.status = "resolved";
    c.resolution = resolution;
    c.resolvedBy = reviewer;
    c.resolvedAt = Date.now();
    if (p.status === "disputed" && !p.conflicts!.some((x) => x.status === "disputed")) p.status = "confirmed";
    p.version++;
    p.updatedAt = Date.now();
    const label = { keep_new: `${c.newer.by}'s newer version kept`, keep_old: "earlier version restored", both: "both apply" }[resolution];
    p.history.push({ version: p.version, at: Date.now(), by: reviewer, summary: `Conflict resolved: ${label} (${c.summary})` });
    regenerateLessons(d, [p.id]);
    return c;
  });
}
