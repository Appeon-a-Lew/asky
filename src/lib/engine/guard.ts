import type { CaseContext, DB, Guardrail, Page, Provenance } from "../types";
import { buildCaseContext, describeCondition, evalAll } from "./context";

// Guardrail check before a tool call. Used by the tutor (block a wrong save),
// by the capture gate, and exposed as the MCP tool `check_guardrail` so an
// agent stops exactly where the expert would.

export interface Violation {
  pageId: string;
  pageTitle: string;
  guardrail: Guardrail;
  reason: string; // what is wrong in this case
  quote?: string;
  expert?: string;
  frameId?: string;
  sessionId?: string;
  utteranceId?: string;
}

export function checkGuardrails(d: DB, tool: string, args: Record<string, unknown>, caseId: string | undefined, trace: string[]): { ctx: CaseContext | null; violations: Violation[]; applicable: { pageId: string; guardrailId: string; text: string }[] } {
  if (!caseId) return { ctx: null, violations: [], applicable: [] };
  const ctx = buildCaseContext(d, caseId, trace);
  if (!ctx) return { ctx: null, violations: [], applicable: [] };
  // Apply pending coding change from args so we judge the state that would be saved.
  const scope = { ...ctx, args, invoice: { ...ctx.invoice } };
  if (tool === "set_invoice_coding" && typeof args.costCenter === "string") {
    scope.invoice.costCenter = args.costCenter;
    scope.invoice.costCenterType = d.costCenters.find((c) => c.code === args.costCenter)?.type;
    if (args.assetNumber !== undefined) scope.invoice.hasAssetNumber = !!args.assetNumber;
  }

  const violations: Violation[] = [];
  const applicable: { pageId: string; guardrailId: string; text: string }[] = [];
  for (const page of d.pages) {
    // experts disagree about these: no rule fires until someone decides
    const paused = new Set((page.conflicts ?? []).filter((c) => c.status === "disputed").flatMap((c) => [...c.older.itemIds, ...c.newer.itemIds]));
    for (const g of page.guardrails) {
      if (paused.has(g.id)) continue;
      const r = g.rule;
      if (!r || (r.onTool !== tool && r.onTool !== "*")) continue;
      if (!evalAll(r.when, scope) || !evalAll(r.argsWhen, scope)) continue;
      applicable.push({ pageId: page.id, guardrailId: g.id, text: g.text });
      let reason: string | null = null;
      if (r.forbid) reason = `"${tool.replace(/_/g, " ")}" is not allowed in this situation`;
      else if (r.requirePriorTool && !trace.includes(r.requirePriorTool)) reason = `"${r.requirePriorTool.replace(/_/g, " ")}" has to happen first`;
      else if (r.require?.length && !evalAll(r.require, scope)) {
        const failed = r.require.filter((c) => !evalAll([c], scope));
        reason = `required: ${failed.map(describeCondition).join(", ")}`;
      }
      if (reason) violations.push({ pageId: page.id, pageTitle: page.title, guardrail: g, reason, ...bestQuote(g.provenance, page) });
    }
  }
  return { ctx, violations, applicable };
}

function bestQuote(prov: Provenance[], page: Page) {
  const p = prov.find((x) => x.quote) ?? page.why.flatMap((w) => w.provenance).find((x) => x.quote);
  return p ? { quote: p.quote, expert: p.personId, frameId: p.frameId, sessionId: p.sessionId, utteranceId: p.utteranceId } : {};
}
