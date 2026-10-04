import "server-only";
import { buildCaseContext, caseLabel } from "../engine/context";
import { llmJSON, llmText, withFallback } from "../llm";
import { db, mutate, uid } from "../store";
import type { DB, Question, QuestionKind, Session, WorkMap, WorkMapStep } from "../types";
import { commitDraft } from "./commit";
import { checkConflicts } from "./conflicts";
import { suggestBlacklistChanges } from "../blacklist";
import { extractKnowledge, type KnowledgeDraft } from "./extract";

// After the task: debrief (≥3 follow-ups the live session did not answer),
// teach-back (explain the whole process back), confirm → commit knowledge.

const MIN_DEBRIEF = 3;
const MAX_DEBRIEF = 6;

export async function prepareDebrief(sessionId: string): Promise<Question[]> {
  const d = db();
  const s = d.sessions.find((x) => x.id === sessionId)!;
  // unanswered live questions move to the debrief
  for (const q of s.questions) if (q.status === "pending" && q.timing !== "debrief") q.timing = "debrief";

  const queued = s.questions.filter((q) => q.timing === "debrief" && q.status === "pending");
  const gaps = await gapQuestions(d, s, queued);
  for (const g of gaps) if (!s.questions.some((q) => q.dedupeKey === g.dedupeKey)) s.questions.push(g);

  const list = s.questions.filter((q) => q.timing === "debrief" && q.status === "pending").sort((a, b) => b.importance - a.importance);
  for (const q of list.slice(MAX_DEBRIEF)) q.status = "dropped";
  s.phase = "debrief";
  s.endedAt ??= Date.now();
  mutate(() => {});
  return list.slice(0, MAX_DEBRIEF);
}

async function gapQuestions(d: DB, s: Session, queued: Question[]): Promise<Question[]> {
  const mk = (text: string, kind: QuestionKind, importance: number, caseId?: string): Question => ({
    id: uid("Q-"), sessionId: s.id, ts: Date.now(), caseId, kind, timing: "debrief", text, importance, status: "pending", dedupeKey: `gap:${kind}:${caseId ?? ""}:${text.slice(0, 40)}`,
  });
  const answered = s.questions.filter((q) => q.status === "answered");
  const res = await withFallback(
    async () => {
      const out = await llmJSON<{ questions: { text: string; kind: QuestionKind; importance: number; caseId?: string }[] }>({
        model: "smart",
        system: "You are an AI apprentice preparing a short spoken debrief with an expert who just finished a task. Find what is still unclear: rules without a limit, guardrails (when to stop and ask), exceptions, cases not seen (counterfactuals), troubleshooting. Do NOT repeat questions already answered or already queued. Each question: one sentence, spoken, concrete (mention invoice/supplier).",
        prompt: JSON.stringify({
          steps: s.events.filter((e) => e.kind === "tool" || e.kind === "external").map((e) => e.summary),
          answered: answered.map((q) => ({ q: q.text, a: q.answer })),
          already_queued: queued.map((q) => q.text),
          existing_pages: d.pages.map((p) => ({ title: p.title, open: p.openQuestions })),
          need_at_least: Math.max(0, MIN_DEBRIEF - queued.length) + 1,
        }),
        schema: { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: { text: { type: "string" }, kind: { type: "string", enum: ["why", "guardrail", "order", "troubleshoot", "counterfactual", "contradiction"] }, importance: { type: "number" }, caseId: { type: "string" } }, required: ["text", "kind", "importance"] } } }, required: ["questions"] },
        name: "debrief_questions",
      });
      return out.questions.slice(0, 4).map((q) => mk(q.text, q.kind, Math.min(1, Math.max(0.3, q.importance)), q.caseId));
    },
    () => heuristicGaps(d, s, queued, mk),
    "debrief",
  );
  return res.value;
}

function heuristicGaps(d: DB, s: Session, queued: Question[], mk: (t: string, k: QuestionKind, i: number, c?: string) => Question): Question[] {
  const out: Question[] = [];
  const answered = s.questions.filter((q) => q.status === "answered");
  // 1) why answered but no limit / guardrail mentioned
  for (const q of answered) {
    if (q.kind === "guardrail" || /never|always|only|stop|ask|limit|above|over|unless/i.test(q.answer ?? "")) continue;
    out.push(mk(`About invoice ${caseLabel(d, q.caseId)}: is there a case where you would not do that, or would stop and ask someone first?`, "guardrail", 0.7, q.caseId));
  }
  // 2) counterfactual on a novel situation
  const cases = [...new Set(s.events.filter((e) => e.caseId && e.kind === "tool").map((e) => e.caseId!))];
  const special = cases.map((c) => buildCaseContext(d, c)).find((c) => c && (c.invoice.costCenterType === "capex" || c.supplier.isSubsidiary));
  if (special) out.push(mk(`What would you do if the ${special.invoice.description} came from a supplier you have never seen before?`, "counterfactual", 0.65, special.invoice.id));
  // 3) troubleshooting is rarely reported — ask explicitly
  out.push(mk("At month-end, what is the most common thing that goes wrong with these invoices, and how do you fix it?", "troubleshoot", 0.6));
  // 4) order questions for reorders seen
  return out.slice(0, Math.max(MIN_DEBRIEF - queued.length, 2) + 1);
}

// ---------------------------------------------------------------------------
// Teach-back
// ---------------------------------------------------------------------------

export async function makeTeachBack(sessionId: string, corrections?: string): Promise<{ text: string; draft: KnowledgeDraft }> {
  const d = db();
  const s = d.sessions.find((x) => x.id === sessionId)!;
  const draft = await extractKnowledge(d, s, corrections);
  const person = d.people.find((p) => p.id === s.personId)?.name.split(" ")[0] ?? "you";
  const res = await withFallback(
    () =>
      llmText({
        model: "smart",
        maxTokens: 500,
        system: `You are an apprentice explaining back to ${person} how they work, in your own words, so they can confirm or correct. Spoken style, second person ("You…"), under 130 words. Plain business language only: never say tool names, function names or code identifiers (no "get_invoice", "set_invoice_coding"). Cover the normal flow and each special situation with its reason and guardrail. End with: "Did I get that right?"`,
        prompt: JSON.stringify({ summary: draft.processSummary, situations: draft.situations.map((x) => ({ when: x.triggerText, do: x.steps.map((st) => st.text), why: x.why.map((w) => w.text), guardrails: x.guardrails.map((g) => g.text) })), corrections }),
      }),
    () => heuristicTeachBack(draft),
    "teachback",
  );
  mutate((dd) => {
    const ss = dd.sessions.find((x) => x.id === sessionId)!;
    ss.phase = "teachback";
    ss.teachBack = { text: res.value, confirmed: false, corrections, at: Date.now() };
  });
  draftCache.set(sessionId, draft);
  return { text: res.value, draft };
}

const draftCache = new Map<string, KnowledgeDraft>();

function heuristicTeachBack(draft: KnowledgeDraft) {
  const parts = [`Let me explain it back. ${draft.processSummary}`];
  for (const x of draft.situations.filter((x) => x.steps.length || x.guardrails.length)) {
    const g = x.guardrails[0]?.text;
    parts.push(`${x.triggerText}, you ${x.steps.map((s) => s.text.charAt(0).toLowerCase() + s.text.slice(1)).join(", then ")}${g ? ` — and: ${g.charAt(0).toLowerCase() + g.slice(1)}` : ""}.`);
  }
  parts.push("Did I get that right?");
  return parts.join(" ");
}

export type TeachBackReply = "confirm" | "correct" | "unclear";

/** Did the expert confirm the teach-back, correct it, or say something else (side talk, a half sentence)? */
export async function classifyTeachBackReply(sessionId: string, reply: string): Promise<TeachBackReply> {
  const s = db().sessions.find((x) => x.id === sessionId);
  const yes = /\b(yes|yeah|yep|correct|right|exactly|ja|genau|stimmt|richtig)\b/i.test(reply);
  const res = await withFallback(
    () =>
      llmJSON<{ kind: TeachBackReply }>({
        model: "fast",
        maxTokens: 60,
        system:
          'An apprentice read back its summary of an expert\'s process and asked "Did I get that right?". Classify the reply (a speech transcript, possibly garbled): "confirm" = agrees without changes; "correct" = adds, changes or disputes something about the process; "unclear" = unrelated, side talk, cut off, or too garbled to act on.',
        prompt: JSON.stringify({ summary: s?.teachBack?.text ?? "", reply }),
        schema: { type: "object", properties: { kind: { type: "string", enum: ["confirm", "correct", "unclear"] } }, required: ["kind"] },
        name: "teachback_reply",
      }).then((r) => r.kind),
    () => (yes ? "confirm" : "correct"),
    "teachback-reply",
  );
  return res.value;
}

export async function confirmTeachBack(sessionId: string, confirmed: boolean, corrections?: string) {
  if (!confirmed) return { again: await makeTeachBack(sessionId, corrections) };
  let draft = draftCache.get(sessionId);
  if (!draft) draft = await extractKnowledge(db(), db().sessions.find((x) => x.id === sessionId)!, corrections);
  const workMap = await buildWorkMap(sessionId, draft);
  const result = mutate((d) => {
    const s = d.sessions.find((x) => x.id === sessionId)!;
    s.teachBack = { ...(s.teachBack ?? { text: "", at: Date.now() }), confirmed: true, corrections };
    s.phase = "done";
    s.workMap = workMap;
    return commitDraft(d, s, draft!, { confirmed: true });
  });
  draftCache.delete(sessionId);
  // what this session added may contradict what the pages already said
  const conflicts = [];
  for (const c of result.changed.filter((x) => !x.created)) conflicts.push(...(await checkConflicts(c.pageId, sessionId)).map((x) => ({ pageId: c.pageId, title: c.title, kind: x.kind, summary: x.summary })));
  const blacklist = await suggestBlacklistChanges(sessionId).catch(() => []);
  const pending = (db().blacklistSuggestions ?? []).filter((x) => x.sessionId === sessionId && x.status === "pending");
  return { committed: { ...result, conflicts, blacklist: pending.length ? pending : blacklist } };
}

// ---------------------------------------------------------------------------
// Work Map: clickable timeline — every step links screen moment + words
// ---------------------------------------------------------------------------

export async function buildWorkMap(sessionId: string, draft?: KnowledgeDraft): Promise<WorkMap> {
  const d = db();
  const s = d.sessions.find((x) => x.id === sessionId)!;
  const steps: WorkMapStep[] = [];
  const t0 = s.startedAt;
  const tools = s.events.filter((e) => (e.kind === "tool" && e.effect !== "read") || e.kind === "external" || (e.kind === "tool" && s.questions.some((q) => q.eventId === e.id)));
  for (const e of tools) {
    const q = s.questions.find((x) => x.eventId === e.id && x.status === "answered");
    const sit = draft?.situations.find((x) => x.caseIds?.includes(e.caseId ?? "") && x.steps?.some((st) => st.tool === e.tool));
    const page = sit ? d.pages.find((p) => p.slug === sit.key) : undefined;
    const caseGuards = s.questions.filter((x) => x.caseId === e.caseId && x.status === "answered" && x.id !== q?.id && (x.kind === "guardrail" || x.kind === "contradiction"));
    steps.push({
      id: uid("W-"),
      index: steps.length + 1,
      caseId: e.caseId,
      title: e.summary.charAt(0).toUpperCase() + e.summary.slice(1),
      ts: e.ts,
      offsetMs: e.ts - t0,
      frameId: e.frameId ?? nearestFrame(s, e.ts),
      eventIds: [e.id],
      decision: e.summary,
      reason: q ? { text: q.answer!, quote: q.answer, utteranceId: q.answerUtteranceIds?.[0], questionId: q.id, ts: s.transcript.find((u) => u.id === q.answerUtteranceIds?.[0])?.ts } : undefined,
      guardrails: [
        ...(sit?.guardrails ?? []).map((g) => ({ text: g.text, quote: g.quote, utteranceId: g.utteranceId })),
        ...caseGuards.map((x) => ({ text: x.answer!, quote: x.answer, utteranceId: x.answerUtteranceIds?.[0] })),
      ].filter((g, k, arr) => arr.findIndex((y) => y.text === g.text) === k),
      nodeId: d.graph.nodes.find((n) => n.tool === e.tool)?.id,
      pageId: page?.id,
    });
  }
  return { sessionId, summary: draft?.processSummary ?? "", steps, generatedBy: draft?.by ?? "heuristic", generatedAt: Date.now() };
}

function nearestFrame(s: Session, ts: number) {
  let best: { id: string; dt: number } | null = null;
  for (const f of s.frames) {
    const dt = Math.abs(f.ts - ts);
    if (dt < 6000 && (!best || dt < best.dt)) best = { id: f.id, dt };
  }
  return best?.id;
}
