import type { DeviationType, InterruptAction, QuestionKind } from "../types";

// TypeSafe Jev ("System One" model) client — https://docs.typesafe.ai
// One fan-out call per event: several typed questions answered in parallel
// with calibrated probabilities. Code stays in control of the final action.

const URL_ = process.env.TYPESAFE_API_URL || "https://api.typesafe.ai/v1/systemone";
const MODEL = process.env.TYPESAFE_MODEL || "jev-latest";

export const hasJev = () => !!process.env.TYPESAFE_API_KEY;

type ChoiceAnswer = { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> };
type ScoreAnswer = { type: "score"; score: number; confidence: number; probabilities: Record<string, number> };
type NoulAnswer = { type: "noul"; noul: number };

export interface JevResponse {
  model: string;
  answers: Record<string, ChoiceAnswer | ScoreAnswer | NoulAnswer>;
}

export async function systemOne(state: unknown, questions: Record<string, unknown>, timeoutMs = 1200): Promise<JevResponse> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(URL_, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ state, model: MODEL, questions }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Jev HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as JevResponse;
  } finally {
    clearTimeout(t);
  }
}

export const INTERRUPT_QUESTIONS = (pageIds: { id: string; title: string }[]) => ({
  action: {
    type: "choice",
    instructions:
      "An AI apprentice watches an expert process an invoice. Decide what it should do about the expert's latest step. Interrupting costs the expert focus; only real judgment calls and guardrails justify it.",
    criteria: {
      ignore: "Routine step, matches the known process or a known page; nothing new to learn",
      ask_now: "A deliberate judgment call or new rule that is only understandable in the moment; ask at the next natural pause",
      ask_before_commit: "Important and the next step is irreversible (posting/payment); must be understood before the expert commits",
      queue_debrief: "Worth learning but small (order change, timing, minor variation); ask in the debrief after the task",
    },
  },
  deviation_type: {
    type: "choice",
    instructions: "What kind of deviation from the documented/observed process is the latest step?",
    criteria: {
      none: "No deviation",
      skip: "Skipped an expected step",
      insert: "Added a step the process does not have",
      reorder: "Same steps, different order",
      loop: "Retry or repeated step, something went wrong",
      dwell: "Took unusually long",
      external_detour: "Left the application to check something elsewhere",
      value_change: "Overrode a pre-filled value",
      novel_entity: "First time this supplier/case type is seen",
      doc_contradiction: "Contradicts the written process document",
    },
  },
  importance: {
    type: "score",
    instructions: "How valuable is understanding this step for teaching a new hire?",
    criteria: ["Habit or noise", "Useful detail", "Critical judgment, rule or guardrail"],
  },
  is_troubleshooting: { type: "noul", instructions: "The expert is working around a problem or error rather than following the normal path" },
  is_judgment_call: { type: "noul", instructions: "The latest step reflects a deliberate expert decision whose reason is not visible on screen" },
  question_kind: {
    type: "choice",
    instructions: "If the apprentice asks, which question reveals the most?",
    criteria: {
      why: "Why this step / why this value",
      guardrail: "Is there a limit, an exception, or when would you stop and ask someone",
      order: "Does the order of these steps matter",
      troubleshoot: "What went wrong and how do you fix it",
      counterfactual: "What would change your decision",
      contradiction: "The document says otherwise — which is right",
    },
  },
  ...(pageIds.length
    ? {
        matched_page: {
          type: "choice",
          instructions: "Which existing knowledge page already explains this situation?",
          criteria: Object.fromEntries([["none", "No page covers it"], ...pageIds.slice(0, 250).map((p) => [p.id, p.title])]),
        },
      }
    : {}),
});

export interface JevDecision {
  action: InterruptAction;
  deviationType: DeviationType;
  importance: number;
  questionKind: QuestionKind;
  isTroubleshooting: boolean;
  matchedPageId?: string;
  confidence: number;
  probabilities: Record<string, number>;
  model: string;
}

export function parseInterrupt(r: JevResponse): JevDecision {
  const a = r.answers;
  const action = a.action as ChoiceAnswer;
  const dt = a.deviation_type as ChoiceAnswer;
  const imp = a.importance as ScoreAnswer;
  const qk = a.question_kind as ChoiceAnswer;
  const mp = a.matched_page as ChoiceAnswer | undefined;
  const impProbs = imp?.probabilities ?? {};
  const expected = Object.entries(impProbs).reduce((s, [k, p]) => s + Number(k) * p, 0) / 2; // 0..1
  return {
    action: action.choice as InterruptAction,
    deviationType: dt?.choice as DeviationType,
    importance: +expected.toFixed(3),
    questionKind: (qk?.choice as QuestionKind) ?? "why",
    isTroubleshooting: ((a.is_troubleshooting as NoulAnswer)?.noul ?? 0) > 0.5,
    matchedPageId: mp && mp.choice !== "none" ? mp.choice : undefined,
    confidence: action.confidence,
    probabilities: action.probabilities,
    model: r.model,
  };
}
