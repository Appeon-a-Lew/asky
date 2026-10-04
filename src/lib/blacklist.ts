import "server-only";
import { activeListing, bareName as bare } from "./engine/context";
import { hasLLM, llmJSON } from "./llm";
import { db, mutate, uid } from "./store";
import type { BlacklistEntry, BlacklistSuggestion } from "./types";


// The company's supplier blacklist. Who is on it changes; the rule "invoices
// from blacklisted suppliers go on hold" does not — so pages keep the rule and
// check supplier.blacklisted, and this list keeps the dated facts.

export function addToBlacklist(e: { supplierName: string; reason: string; by: string; source?: string; at?: number; sessionId?: string }): BlacklistEntry {
  return mutate((d) => {
    const cur = activeListing(d, e.supplierName);
    if (cur) return cur;
    const entry: BlacklistEntry = { id: uid("BL-"), supplierName: e.supplierName.trim(), reason: e.reason, source: e.source, addedAt: e.at ?? Date.now(), addedBy: e.by, sessionIds: e.sessionId ? [e.sessionId] : undefined };
    (d.blacklist ??= []).push(entry);
    return entry;
  });
}

export function removeFromBlacklist(e: { supplierName: string; reason: string; by: string; at?: number; sessionId?: string }): BlacklistEntry | null {
  return mutate((d) => {
    const cur = activeListing(d, e.supplierName);
    if (!cur) return null;
    cur.removedAt = e.at ?? Date.now();
    cur.removedBy = e.by;
    cur.removedReason = e.reason;
    if (e.sessionId) (cur.sessionIds ??= []).push(e.sessionId);
    return cur;
  });
}

// ---------------------------------------------------------------------------
// Suggestions: asky hears "we took Schmidt off the blacklist" and proposes the
// list change. A person applies or dismisses it — a list that blocks payments
// is never edited by what a model believes it heard.

const MENTION = /blacklist|black list|block ?list|sperrliste|schwarze[n]? liste|gesperrt|sperren|kara ?liste/i;

export const mentionsBlacklist = (text: string) => MENTION.test(text);

const SUGGEST_SYSTEM = `You read what an accounts-payable expert said while working. Find statements that a supplier was put on, or taken off, the company's supplier blacklist (a list of suppliers whose invoices must not be paid). Only real changes stated as fact ("we are blacklisting X", "X is off the blacklist now", "wir haben X gesperrt") — not questions, hypotheticals or general rules ("blacklisted suppliers go on hold"). Use the exact supplier name from known_suppliers when it is one of them (speech transcripts misspell names: "Schmidt Logistic" is "Schmidt Logistik KG"); set unknownSupplier when it is not. reason: why, in a few English words, from what was said (empty if not said). utteranceId: the id of the statement. quote: the statement verbatim.`;

/** Scan a session for blacklist changes someone stated; store new suggestions (pending) and return them. */
export async function suggestBlacklistChanges(sessionId: string): Promise<BlacklistSuggestion[]> {
  const d = db();
  const s = d.sessions.find((x) => x.id === sessionId);
  if (!s || !hasLLM()) return [];
  // what the experts said that mentions the list, with asky's question before it for context
  const said = s.transcript.flatMap((u, k) => (u.speaker === "expert" && !u.offRecord && mentionsBlacklist(u.text) ? [{ id: u.id, ts: u.ts, text: u.text, after_question: [...s.transcript.slice(0, k)].reverse().find((x) => x.speaker === "agent")?.text }] : []));
  if (!said.length) return [];
  const known = [...new Set([...d.suppliers, ...(d.erp?.suppliers ?? [])].map((x) => x.name))];
  const r = await llmJSON<{ changes: { action: "add" | "remove"; supplierName: string; unknownSupplier?: boolean; reason: string; quote: string; utteranceId: string }[] }>({
    model: "fast",
    maxTokens: 800,
    system: SUGGEST_SYSTEM,
    prompt: JSON.stringify({ known_suppliers: known, current_blacklist: (d.blacklist ?? []).filter((b) => !b.removedAt).map((b) => b.supplierName), statements: said }),
    schema: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: { action: { type: "string", enum: ["add", "remove"] }, supplierName: { type: "string" }, unknownSupplier: { type: "boolean" }, reason: { type: "string" }, quote: { type: "string" }, utteranceId: { type: "string" } },
            required: ["action", "supplierName", "reason", "quote", "utteranceId"],
          },
        },
      },
      required: ["changes"],
    },
    name: "blacklist_changes",
  }).catch((e) => (console.warn("[blacklist:suggest]", (e as Error).message), { changes: [] }));

  return mutate((dd) => {
    const made: BlacklistSuggestion[] = [];
    for (const c of r.changes) {
      const u = s.transcript.find((x) => x.id === c.utteranceId) ?? s.transcript.find((x) => x.text === c.quote);
      const at = u?.ts ?? Date.now();
      const name = bare(c.supplierName);
      const listed = activeListing(dd, c.supplierName);
      // already true, or the list changed for this supplier after it was said
      if ((c.action === "add" && listed) || (c.action === "remove" && !listed)) continue;
      const last = (dd.blacklist ?? []).filter((b) => bare(b.supplierName) === name).map((b) => Math.max(b.addedAt, b.removedAt ?? 0)).sort((a, b) => b - a)[0];
      if (last && last >= at) continue;
      if ((dd.blacklistSuggestions ?? []).some((x) => x.sessionId === sessionId && x.action === c.action && bare(x.supplierName) === name)) continue;
      const sug: BlacklistSuggestion = {
        id: uid("BLS-"), action: c.action, supplierName: c.supplierName.trim(), unknownSupplier: c.unknownSupplier || !known.some((k) => bare(k) === name) || undefined,
        reason: c.reason, quote: u?.text ?? c.quote, personId: s.personId, sessionId, utteranceId: u?.id, at, status: "pending",
      };
      (dd.blacklistSuggestions ??= []).push(sug);
      made.push(sug);
    }
    return made;
  });
}

/** A person decides. Applying lists (or delists) the supplier as of when it was said, by who said it. */
export function decideSuggestion(id: string, decision: "apply" | "dismiss", by = "Reviewer") {
  const d = db();
  const sug = d.blacklistSuggestions?.find((x) => x.id === id);
  if (!sug || sug.status !== "pending") return null;
  const speaker = d.people.find((p) => p.id === sug.personId)?.name ?? sug.personId;
  if (decision === "apply") {
    const reason = sug.reason || `"${sug.quote}"`;
    if (sug.action === "add") addToBlacklist({ supplierName: sug.supplierName, reason, by: speaker, at: sug.at, sessionId: sug.sessionId, source: "said in a session, confirmed in the hub" });
    else removeFromBlacklist({ supplierName: sug.supplierName, reason: `${reason} — "${sug.quote}"`, by: speaker, at: sug.at, sessionId: sug.sessionId });
  }
  return mutate((dd) => {
    const x = dd.blacklistSuggestions!.find((y) => y.id === id)!;
    x.status = decision === "apply" ? "applied" : "dismissed";
    x.decidedBy = by;
    x.decidedAt = Date.now();
    return x;
  });
}
