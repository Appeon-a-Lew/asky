import type { AppEvent, CaseContext, DB, DeviationCandidate, Page, Session } from "../types";
import { buildCaseContext, matchPages } from "./context";
import { conditionViolations, edgeStats, expectedNext, groupOf, nodeOfTool, reachable } from "./graph";

// Graph-relative deviation detection. Compares what the expert just did with
// what the execution graph (doc baseline + everything observed so far) and the
// knowledge pages expect. Produces feature-rich candidates for the decision
// model (Jev or rules) — it never decides whether to interrupt by itself.

const NOISE = new Set(["list_invoices", "list_cost_centers"]);

/** Meaningful tool steps of one case, in order (repeated get_invoice reloads dropped). */
export function caseTrace(events: AppEvent[], caseId: string): AppEvent[] {
  const out: AppEvent[] = [];
  for (const e of events) {
    if (e.kind !== "tool" && e.kind !== "external") continue;
    if (e.caseId !== caseId || (e.tool && NOISE.has(e.tool))) continue;
    if (e.tool === "get_invoice" && out.some((x) => x.tool === "get_invoice")) continue;
    out.push(e);
  }
  return out;
}

export interface Detection {
  candidates: DeviationCandidate[];
  ctx: CaseContext | null;
  pages: Page[];
  knownBy: Page[]; // pages whose steps already describe this step in this situation
  prevTool: string | null;
  expected: { tool: string; prob: number }[];
}

export function detectDeviations(d: DB, session: Session, ev: AppEvent): Detection {
  const g = d.graph;
  const empty: Detection = { candidates: [], ctx: null, pages: [], knownBy: [], prevTool: null, expected: [] };
  if (!ev.caseId || (ev.tool && NOISE.has(ev.tool))) return empty;
  const trace = caseTrace(session.events, ev.caseId);
  const idx = trace.findIndex((x) => x.id === ev.id);
  if (idx < 0) return empty; // a dropped reload
  const prevEv = idx > 0 ? trace[idx - 1] : null;
  const done = trace.slice(0, idx).map((x) => x.tool!).filter(Boolean);
  // expectations come from the last step the graph knows (a just-inserted step has no edges yet)
  const prev = [...done].reverse().find((t) => nodeOfTool(g, t)) ?? null;
  const ctx = buildCaseContext(d, ev.caseId, done);
  const pages = ctx ? matchPages(d.pages, ctx) : [];
  const tool = ev.tool!;
  const exp = expectedNext(g, prev);
  const expected = [...exp.entries()].map(([t, v]) => ({ tool: t, prob: +v.prob.toFixed(2) })).sort((a, b) => b.prob - a.prob);

  const covered = pages.some((p) => [...p.steps, ...p.guardrails.map((x) => ({ text: x.text, nodeId: x.rule?.onTool }))].some((s) => s.nodeId === tool || s.text.toLowerCase().includes(tool.replace(/_/g, " "))));
  const uncertainty = covered ? 0.15 : 1;
  const knownBy = pages.filter((p) => p.steps.some((s) => s.nodeId === tool));
  const hasHistory = g.traces.length > 0; // in the very first session everything is "new"
  const novelty = hasHistory && ctx?.supplier.isNew ? 1 : 0.2;
  const nextTop = expectedNext(g, tool);
  const irreversibleNext =
    ev.effect === "irreversible" ||
    [...nextTop.entries()].some(([t, v]) => v.prob > 0.5 && d.tools?.tools.find((x) => x.name === t)?.effect === "irreversible");

  const base = { novelty, uncertainty, irreversibleNext, expected: expected.map((e) => e.tool) };
  const cands: DeviationCandidate[] = [];

  if (ev.kind === "external") {
    cands.push({ ...base, type: "external_detour", detail: `Left the app: ${ev.external?.app} — ${ev.external?.description}`, surprise: 0.8 });
  } else if (!nodeOfTool(g, tool)) {
    cands.push({ ...base, type: "insert", detail: `Step "${tool}" is not in the documented process`, surprise: 1 });
  } else if (exp.has(tool)) {
    const viol = ctx ? conditionViolations(exp.get(tool)!.via, ctx) : [];
    if (viol.length) {
      cands.push({ ...base, type: "doc_contradiction", detail: `Process says "${viol.map((v) => v.condition).join(", ")}" but this case does not meet it`, surprise: 0.9, docContradiction: viol.map((v) => v.condition).join(", ") });
    } else {
      const p = exp.get(tool)!.prob;
      if (p < 0.15) cands.push({ ...base, type: "insert", detail: `Rare path: ${prev ?? "start"} → ${tool} (p=${p.toFixed(2)})`, surprise: 1 - p });
    }
  } else {
    const reach = reachable(g, prev);
    const r = reach.get(tool);
    const skippedNotDone = (r?.skipped ?? []).filter((s) => !done.includes(s));
    const viol = r && ctx ? conditionViolations(r.via, ctx) : [];
    const grp = prev ? groupOf(g, prev, tool) : undefined;
    if (viol.length) {
      cands.push({ ...base, type: "doc_contradiction", detail: `Process says "${viol.map((v) => v.condition).join(", ")}" but this case does not meet it`, surprise: 0.9, docContradiction: viol.map((v) => v.condition).join(", ") });
    } else if (grp?.status === "permutable") {
      // known to be order-independent → not a deviation
    } else if (r && skippedNotDone.length) {
      cands.push({ ...base, type: "skip", detail: `Skipped ${skippedNotDone.join(", ")} before ${tool}`, surprise: 0.8, expected: skippedNotDone });
    } else {
      cands.push({ ...base, type: "reorder", detail: `${tool} came after ${prev ?? "start"}; usual order differs`, surprise: 0.5 });
    }
  }

  // value change: the expert overrode a pre-filled value
  const changed = (ev.args?.__changed ?? undefined) as { from?: string; to?: string } | undefined;
  if (changed && changed.from !== changed.to) {
    const cf = d.costCenters.find((c) => c.code === changed.from);
    const ct = d.costCenters.find((c) => c.code === changed.to);
    cands.push({ ...base, type: "value_change", detail: `Changed ${tool.replace(/_/g, " ")} ${changed.from}${cf ? ` (${cf.type})` : ""} → ${changed.to}${ct ? ` (${ct.type})` : ""}`, surprise: cf && ct && cf.type !== ct.type ? 1 : 0.6 });
  }

  // troubleshooting signals
  if (ev.ok === false) cands.push({ ...base, type: "loop", detail: `${tool} failed: ${ev.error ?? "error"} — retry/workaround follows`, surprise: 0.9 });
  else if (ev.effect !== "read" && done.filter((t) => t === tool).length >= 1) cands.push({ ...base, type: "loop", detail: `${tool} repeated in this case`, surprise: 0.6 });

  // dwell: unusually long gap before this step
  if (prevEv) {
    const gap = ev.ts - prevEv.ts;
    const st = edgeStats(g, prev, tool);
    const p90 = st?.p90Ms ?? 30000;
    if (gap > Math.max(45000, 2 * p90)) cands.push({ ...base, type: "dwell", detail: `${Math.round(gap / 1000)}s between ${prev} and ${tool} (usual ≤ ${Math.round(p90 / 1000)}s)`, surprise: 0.6 });
  }

  if (!cands.length && hasHistory && ctx?.supplier.isNew && ev.effect !== "read") {
    cands.push({ ...base, type: "novel_entity", detail: `First time this supplier (${ctx.supplier.name}) is seen`, surprise: 0.5 });
  }

  return { candidates: cands, ctx, pages, knownBy, prevTool: prev, expected };
}
