import type { CaseContext, ExecGraph, GEdge, GNode } from "../types";
import { evalAll } from "./context";

// Execution-graph queries used by deviation detection and the tutor.

export const nodeOfTool = (g: ExecGraph, tool: string): GNode | undefined =>
  g.nodes.find((n) => n.tool === tool && n.type === "action") ?? g.nodes.find((n) => n.tool === tool);

const isStep = (n: GNode) => n.type === "action" || n.type === "external_app";

/**
 * Next action steps reachable from `fromTool` (or start), walking through
 * non-action nodes (checks, decisions, notes). Returns tool → probability and
 * the edges used, so callers can tell which conditions applied.
 */
export function expectedNext(g: ExecGraph, fromTool: string | null): Map<string, { prob: number; via: GEdge[] }> {
  const start = fromTool ? nodeOfTool(g, fromTool) : g.nodes.find((n) => n.type === "start");
  const out = new Map<string, { prob: number; via: GEdge[] }>();
  if (!start) return out;
  const walk = (nodeId: string, prob: number, via: GEdge[], depth: number) => {
    if (depth > 6) return;
    const edges = g.edges.filter((e) => e.from === nodeId);
    const total = edges.reduce((s, e) => s + e.prob, 0) || 1;
    for (const e of edges) {
      const n = g.nodes.find((x) => x.id === e.to);
      if (!n) continue;
      const p = (prob * e.prob) / total;
      const path = [...via, e];
      if (isStep(n) && n.tool) {
        const prev = out.get(n.tool);
        if (!prev || prev.prob < p) out.set(n.tool, { prob: p, via: path });
      } else if (n.type !== "end") {
        walk(n.id, p, path, depth + 1);
      }
    }
  };
  walk(start.id, 1, [], 0);
  return out;
}

/** All tools reachable from `fromTool` (used to detect skips): tool → skipped tools + edges walked. */
export function reachable(g: ExecGraph, fromTool: string | null, maxDepth = 8): Map<string, { skipped: string[]; via: GEdge[] }> {
  const res = new Map<string, { skipped: string[]; via: GEdge[] }>();
  let frontier: { tool: string | null; skipped: string[]; via: GEdge[] }[] = [{ tool: fromTool, skipped: [], via: [] }];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next: typeof frontier = [];
    for (const f of frontier) {
      for (const [tool, v] of expectedNext(g, f.tool)) {
        if (res.has(tool)) continue;
        const item = { skipped: f.skipped, via: [...f.via, ...v.via] };
        res.set(tool, item);
        next.push({ tool, skipped: [...f.skipped, tool], via: item.via });
      }
    }
    frontier = next;
  }
  return res;
}

/** Does any edge condition on the path to `tool` contradict this case? */
export function conditionViolations(path: GEdge[], ctx: CaseContext): GEdge[] {
  return path.filter((e) => e.when && e.when.length && !evalAll(e.when, ctx));
}

export function edgeStats(g: ExecGraph, fromTool: string | null, toTool: string) {
  const a = fromTool ? nodeOfTool(g, fromTool)?.id : g.nodes.find((n) => n.type === "start")?.id;
  const b = nodeOfTool(g, toTool)?.id;
  return g.edges.find((e) => e.from === a && e.to === b);
}

export function groupOf(g: ExecGraph, a: string, b: string) {
  const na = nodeOfTool(g, a)?.id;
  const nb = nodeOfTool(g, b)?.id;
  return g.groups.find((gr) => na && nb && gr.nodeIds.includes(na) && gr.nodeIds.includes(nb));
}
