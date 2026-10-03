import "server-only";
import { llmJSON, withFallback } from "../llm";
import { db, mutate, uid } from "../store";
import type { DB, Question, QuestionKind } from "../types";
import { commitDraft } from "./commit";
import { extractFreeHeuristic, extractKnowledge } from "./extract";

// Guided interview: ask about exactly what the hub is unsure about.
export async function guidedQuestions(d: DB, personId: string): Promise<{ text: string; kind: QuestionKind; importance: number; why: string }[]> {
  const g = d.graph;
  const label = (id: string) => g.nodes.find((n) => n.id === id)?.label ?? id;
  const gaps: { text: string; kind: QuestionKind; importance: number; why: string }[] = [];
  for (const p of d.pages) for (const q of p.openQuestions) gaps.push({ text: q.startsWith("Confirm") ? q.replace(/^Confirm on screen: /, "You said ") + " — is that always true, or are there exceptions?" : q, kind: "guardrail", importance: 0.8, why: `open question on "${p.title}"` });
  for (const p of d.pages.filter((x) => x.experts.length === 1 && !x.experts.includes(personId))) gaps.push({ text: `${d.people.find((x) => x.id === p.experts[0])?.name.split(" ")[0]} told me: “${p.why[0]?.text ?? p.title}” — do you handle it the same way?`, kind: "contradiction", importance: 0.85, why: `bus factor 1: "${p.title}"` });
  for (const e of g.edges.filter((x) => x.source === "observed" && x.prob < 0.2 && !x.condition)) gaps.push({ text: `Sometimes after “${label(e.from)}” you go straight to “${label(e.to)}”. When does that happen?`, kind: "why", importance: 0.6, why: `rare branch p=${e.prob}` });
  for (const gr of g.groups.filter((x) => x.status === "unknown")) gaps.push({ text: `Does the order of “${gr.nodeIds.map(label).join("” and “")}” matter?`, kind: "order", importance: 0.5, why: "order seen both ways" });
  const stated = d.pages.filter((p) => p.why.some((w) => w.provenance.every((x) => x.source === "stated")));
  for (const p of stated) gaps.push({ text: `In the interview you said “${p.why[0].text.slice(0, 90)}”. Can you show or tell me a case where that did NOT apply?`, kind: "counterfactual", importance: 0.7, why: "stated, never observed" });
  if (!gaps.length) gaps.push({ text: "What is the trickiest invoice you had this year, and what made it tricky?", kind: "counterfactual", importance: 0.6, why: "no gaps known — fish for edge cases" }, { text: "When does something go wrong at month-end, and how do you fix it?", kind: "troubleshoot", importance: 0.6, why: "troubleshooting is rarely reported" });

  const r = await withFallback(
    async () => (await llmJSON<{ questions: { text: string; kind: QuestionKind; importance: number; why: string }[] }>({
      model: "fast",
      system: "Rewrite these interview questions for a spoken conversation with an expert: short, warm, concrete, one question each. Keep the order of importance; drop duplicates; max 6.",
      prompt: JSON.stringify(gaps),
      schema: { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: { text: { type: "string" }, kind: { type: "string", enum: ["why", "guardrail", "order", "troubleshoot", "counterfactual", "contradiction"] }, importance: { type: "number" }, why: { type: "string" } }, required: ["text", "kind", "importance", "why"] } } }, required: ["questions"] },
    })).questions,
    () => gaps.sort((a, b) => b.importance - a.importance).slice(0, 6),
    "guided",
  );
  return r.value;
}

export async function startInterview(mode: "interview_free" | "interview_guided", personId: string) {
  const d = db();
  const qs = mode === "interview_guided" ? await guidedQuestions(d, personId) : [];
  return mutate((dd) => {
    const s = {
      id: uid("S-"), mode, personId, title: `${mode === "interview_free" ? "Free-form" : "Guided"} interview · ${dd.people.find((p) => p.id === personId)?.name}`,
      startedAt: Date.now(), phase: "live" as const, events: [], frames: [], transcript: [], offRecord: [],
      questions: qs.map((q): Question => ({ id: uid("Q-"), sessionId: "", ts: Date.now(), kind: q.kind, timing: "debrief", text: q.text, importance: q.importance, status: "pending", dedupeKey: q.text.slice(0, 50) })),
    };
    s.questions.forEach((q) => (q.sessionId = s.id));
    dd.sessions.push(s);
    return { session: s, reasons: qs.map((q) => q.why) };
  });
}

export async function finishInterview(sessionId: string) {
  const d = db();
  const s = d.sessions.find((x) => x.id === sessionId)!;
  const draft = s.mode === "interview_free"
    ? (await withFallback(() => extractKnowledge(d, s), () => extractFreeHeuristic(s), "free-interview")).value
    : await extractKnowledge(d, s);
  if (s.mode === "interview_free" && draft.by === "heuristic" && !draft.situations.length) Object.assign(draft, extractFreeHeuristic(s));
  return mutate((dd) => {
    const ss = dd.sessions.find((x) => x.id === sessionId)!;
    ss.phase = "done";
    ss.endedAt = Date.now();
    // transcript also becomes a doc in the hub
    dd.docs.push({ id: uid("DOC-"), title: ss.title, kind: "transcript", content: ss.transcript.map((u) => `**${u.speaker}:** ${u.text}`).join("\n\n"), source: `session ${ss.id}`, createdAt: Date.now() });
    return commitDraft(dd, ss, draft, { confirmed: ss.mode === "interview_guided" });
  });
}
