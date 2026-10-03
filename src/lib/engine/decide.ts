import type { AppEvent, DB, DecisionRecord, Session } from "../types";
import type { Detection } from "./deviation";
import { hasJev, INTERRUPT_QUESTIONS, parseInterrupt, systemOne } from "./jev";
import { scoreRules } from "./rules";

// System 1 decision: should the apprentice interrupt, and how?
// Jev answers when configured (70–500 ms), the rule scorer always runs as
// baseline/fallback. Low Jev confidence → fall back to rules (confidence-gated
// routing). Pause detection + question budget are applied client-side.

const MIN_CONFIDENCE = 0.45;

export function jevState(d: DB, session: Session, ev: AppEvent, det: Detection) {
  const recent = session.events.filter((e) => e.kind === "tool" && e.caseId === ev.caseId).slice(-8).map((e) => e.summary);
  const asked10 = session.questions.filter((q) => q.askedAt && ev.ts - q.askedAt < 600_000).length;
  return {
    task: "Accounts payable invoice processing",
    latest_step: { tool: ev.tool ?? ev.external?.app, effect: ev.effect, summary: ev.summary, ok: ev.ok },
    case: det.ctx && {
      invoice: { id: det.ctx.invoice.id, amount: det.ctx.invoice.amount, currency: det.ctx.invoice.currency, cost_center: det.ctx.invoice.costCenter, cost_center_type: det.ctx.invoice.costCenterType, categories: det.ctx.invoice.lineCategories, month: det.ctx.invoice.month, has_asset_number: det.ctx.invoice.hasAssetNumber },
      supplier: { name: det.ctx.supplier.name, country: det.ctx.supplier.country, group_company: det.ctx.supplier.isSubsidiary, first_time_seen: det.ctx.supplier.isNew, earlier_invoices_with_same_amount: det.ctx.supplier.priorInvoicesSameAmount },
    },
    steps_so_far_in_case: recent,
    process_expected_next: det.expected.slice(0, 4),
    detected_deviations: det.candidates.map((c) => ({ type: c.type, detail: c.detail, surprise: c.surprise, covered_by_known_page: c.uncertainty < 0.5 })),
    known_pages_for_case: det.pages.map((p) => ({ id: p.id, title: p.title, status: p.status })),
    next_step_irreversible: det.candidates.some((c) => c.irreversibleNext),
    interruptions_last_10_min: asked10,
    budget_per_10_min: d.settings.questionBudgetPer10Min,
  };
}

export async function decide(d: DB, session: Session, ev: AppEvent, det: Detection): Promise<DecisionRecord> {
  const t0 = performance.now();
  const rules = scoreRules(det.candidates);
  const ruleRec: DecisionRecord = {
    engine: "rules",
    action: rules.action,
    deviationType: rules.deviationType,
    importance: rules.importance,
    questionKind: rules.questionKind,
    isTroubleshooting: rules.isTroubleshooting,
    matchedPageId: det.pages[0]?.id,
    latencyMs: 0,
    rulesAction: rules.action,
  };
  // Nothing detected → no need to spend a model call.
  if (!det.candidates.length) return { ...ruleRec, latencyMs: +(performance.now() - t0).toFixed(2) };
  if (!hasJev()) return { ...ruleRec, latencyMs: +(performance.now() - t0).toFixed(2), fellBack: "no TYPESAFE_API_KEY" };

  try {
    const t1 = performance.now();
    const r = await systemOne(jevState(d, session, ev, det), INTERRUPT_QUESTIONS(d.pages.map((p) => ({ id: p.id, title: p.title }))));
    const j = parseInterrupt(r);
    const latencyMs = +(performance.now() - t1).toFixed(1);
    if (j.confidence < MIN_CONFIDENCE) {
      return { ...ruleRec, latencyMs, probabilities: j.probabilities, confidence: j.confidence, fellBack: `Jev confidence ${j.confidence.toFixed(2)} < ${MIN_CONFIDENCE}` };
    }
    return {
      engine: "jev",
      action: j.action,
      deviationType: j.deviationType ?? rules.deviationType,
      importance: Math.max(j.importance, 0),
      questionKind: j.questionKind,
      isTroubleshooting: j.isTroubleshooting,
      matchedPageId: j.matchedPageId,
      probabilities: j.probabilities,
      confidence: j.confidence,
      latencyMs,
      rulesAction: rules.action,
    };
  } catch (e) {
    return { ...ruleRec, latencyMs: +(performance.now() - t0).toFixed(1), fellBack: `Jev error: ${(e as Error).message.slice(0, 120)}` };
  }
}
