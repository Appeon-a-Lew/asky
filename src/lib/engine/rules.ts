import type { DeviationCandidate, DeviationType, InterruptAction, QuestionKind } from "../types";

// Deterministic interrupt scorer (<1 ms). Baseline + fallback for Jev.
//   importance = w_type × surprise × uncertainty (+ novelty, irreversibility)
// Ordering-only deviations always wait for the debrief (permutability unknown).

const W: Record<DeviationType, number> = {
  none: 0,
  doc_contradiction: 0.95,
  insert: 0.9,
  value_change: 0.9,
  skip: 0.75,
  loop: 0.6,
  external_detour: 0.55,
  novel_entity: 0.5,
  dwell: 0.45,
  shortcut: 0.6,
  reorder: 0.35,
};

const KIND: Record<DeviationType, QuestionKind> = {
  none: "why",
  doc_contradiction: "contradiction",
  insert: "why",
  value_change: "why",
  skip: "guardrail",
  loop: "troubleshoot",
  external_detour: "why",
  novel_entity: "guardrail",
  dwell: "troubleshoot",
  shortcut: "guardrail",
  reorder: "order",
};

export interface RuleScore {
  action: InterruptAction;
  importance: number;
  deviationType: DeviationType;
  questionKind: QuestionKind;
  isTroubleshooting: boolean;
  top?: DeviationCandidate;
}

export function importanceOf(c: DeviationCandidate) {
  const v = W[c.type] * (0.4 + 0.6 * c.surprise) * (0.35 + 0.65 * c.uncertainty) + 0.1 * c.novelty + (c.irreversibleNext ? 0.12 : 0);
  return Math.min(1, +v.toFixed(3));
}

export function scoreRules(cands: DeviationCandidate[]): RuleScore {
  if (!cands.length) return { action: "ignore", importance: 0, deviationType: "none", questionKind: "why", isTroubleshooting: false };
  const ranked = cands.map((c) => ({ c, imp: importanceOf(c) })).sort((a, b) => b.imp - a.imp);
  const { c, imp } = ranked[0];
  let action: InterruptAction;
  if (c.type === "reorder" || c.type === "dwell") action = imp >= 0.2 ? "queue_debrief" : "ignore";
  else if (imp >= 0.55) action = c.irreversibleNext ? "ask_before_commit" : "ask_now";
  else if (imp >= 0.25) action = "queue_debrief";
  else action = "ignore";
  return {
    action,
    importance: imp,
    deviationType: c.type,
    questionKind: KIND[c.type],
    isTroubleshooting: c.type === "loop" || c.type === "dwell",
    top: c,
  };
}
