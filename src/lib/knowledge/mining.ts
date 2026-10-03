import { caseTrace } from "../engine/deviation";
import type { DB, ExecGraph, GEdge, GNode, Session } from "../types";

// Process mining: fold observed case traces into the execution graph.
// Doc edges stay (dashed in the UI) but lose weight once reality is observed.

const NOISE = new Set(["list_invoices", "list_cost_centers"]);

export function addSessionTraces(d: DB, s: Session) {
  if (s.mode !== "capture") return;
  const cases = [...new Set(s.events.filter((e) => e.kind === "tool" && e.caseId && !NOISE.has(e.tool!)).map((e) => e.caseId!))];
  d.graph.traces = d.graph.traces.filter((t) => t.sessionId !== s.id);
  for (const c of cases) {
    const steps = caseTrace(s.events, c)
      .filter((e) => e.ok !== false)
      .map((e) => ({ tool: e.tool ?? `ext:${e.external?.app}`, ts: e.ts }));
    if (steps.length) d.graph.traces.push({ sessionId: s.id, caseId: c, personId: s.personId, steps });
  }
}

const p90 = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(0.9 * s.length))];
};

export function rebuildGraph(d: DB): ExecGraph {
  const g = d.graph;
  const tools = new Map((d.tools?.tools ?? []).map((t) => [t.name, t]));
  const nodeIdOf = (tool: string) => g.nodes.find((n) => n.tool === tool)?.id;

  // 1) nodes for every observed tool
  const avgIndex = new Map<string, number[]>();
  for (const t of g.traces) t.steps.forEach((s, k) => (avgIndex.get(s.tool) ?? avgIndex.set(s.tool, []).get(s.tool)!).push(k));
  let extra = 0;
  for (const [tool, idx] of avgIndex) {
    if (nodeIdOf(tool)) continue;
    const ext = tool.startsWith("ext:");
    const avg = idx.reduce((a, b) => a + b, 0) / idx.length;
    const n: GNode = {
      id: tool.replace(/[^a-z0-9_:]/gi, "_"),
      type: ext ? "external_app" : "action",
      label: ext ? tool.slice(4) : tools.get(tool)?.title ?? tool,
      tool,
      pageIds: [],
      provenance: [{ source: "observed" }],
      count: 0,
      x: 300 + 260 * (extra++ % 2),
      y: 110 * (1 + avg),
    };
    g.nodes.push(n);
  }

  // 2) observed edges
  const obs = new Map<string, { count: number; gaps: number[]; experts: Set<string> }>();
  const counts = new Map<string, number>();
  const startId = g.nodes.find((n) => n.type === "start")!.id;
  const endId = g.nodes.find((n) => n.type === "end")!.id;
  for (const t of g.traces) {
    const ids = [startId, ...t.steps.map((s) => nodeIdOf(s.tool)!), endId];
    const ts = [t.steps[0]?.ts, ...t.steps.map((s) => s.ts), t.steps.at(-1)?.ts];
    ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    for (let k = 0; k < ids.length - 1; k++) {
      if (ids[k] === ids[k + 1]) continue;
      const key = `${ids[k]}->${ids[k + 1]}`;
      const o = obs.get(key) ?? { count: 0, gaps: [], experts: new Set<string>() };
      o.count++;
      if (ts[k] && ts[k + 1]) o.gaps.push(ts[k + 1]! - ts[k]!);
      o.experts.add(t.personId);
      obs.set(key, o);
    }
  }
  for (const n of g.nodes) {
    n.count = counts.get(n.id) ?? 0;
    // once reality is observed, name the step after what the app does; keep the doc wording
    const t = n.tool ? tools.get(n.tool) : undefined;
    if (n.count && t && n.provenance.some((p) => p.source === "doc") && n.label !== t.title) {
      n.description ??= `2019 doc: "${n.label}"`;
      n.label = t.title;
    }
  }

  const outTotals = new Map<string, number>();
  for (const [key, o] of obs) {
    const from = key.split("->")[0];
    outTotals.set(from, (outTotals.get(from) ?? 0) + o.count);
  }
  const kept: GEdge[] = [];
  for (const e of g.edges) {
    if (e.source === "observed") continue; // recomputed below
    const hasObserved = outTotals.has(e.from);
    kept.push({ ...e, prob: e.source === "doc" && hasObserved ? Math.min(e.prob, 0.25) : e.prob });
  }
  for (const [key, o] of obs) {
    const [from, to] = key.split("->");
    const existing = kept.find((e) => e.from === from && e.to === to);
    const prob = o.count / (outTotals.get(from) || 1);
    const stats = { count: o.count, prob: +prob.toFixed(3), avgMs: o.gaps.length ? Math.round(o.gaps.reduce((a, b) => a + b, 0) / o.gaps.length) : undefined, p90Ms: p90(o.gaps), experts: [...o.experts] };
    if (existing && existing.source !== "doc") Object.assign(existing, stats);
    else kept.push({ id: `${key}#obs`, from, to, source: "observed", ...stats });
  }
  g.edges = kept;

  // 3) permutable candidates: A→B and B→A both observed
  for (const e of g.edges.filter((x) => x.source === "observed")) {
    const back = g.edges.find((x) => x.source === "observed" && x.from === e.to && x.to === e.from);
    if (!back) continue;
    const ids = [e.from, e.to].sort();
    if (!g.groups.some((gr) => gr.nodeIds.join() === ids.join())) g.groups.push({ id: `PG-${ids.join("-")}`, nodeIds: ids, status: "unknown" });
  }

  // 4) link pages to nodes, conditions to edges
  for (const n of g.nodes) n.pageIds = [];
  for (const p of d.pages) {
    const used = new Set([...p.steps.map((s) => s.nodeId), ...p.guardrails.map((x) => x.rule?.onTool), ...p.guardrails.map((x) => x.rule?.requirePriorTool)].filter(Boolean) as string[]);
    for (const tool of used) {
      const n = g.nodes.find((x) => x.tool === tool || x.id === tool);
      if (n && !n.pageIds.includes(p.id)) n.pageIds.push(p.id);
    }
    // the page's characteristic (first) step gets its trigger as edge condition
    const first = p.steps.find((st) => st.nodeId)?.nodeId;
    const node = first ? g.nodes.find((x) => x.tool === first) : undefined;
    if (node && node.count < g.traces.length) {
      const cond = p.triggerText.replace(/^When (the )?/i, "").slice(0, 48);
      for (const e of g.edges.filter((x) => x.to === node.id && x.source === "observed")) if (!e.condition) e.condition = cond;
    }
  }

  layout(g);
  g.version++;
  g.updatedAt = Date.now();
  return g;
}

/**
 * Layered layout (Sugiyama-lite): rank by longest path over what experts
 * actually do (doc edges only place doc-only steps), drop back edges, then
 * order each layer by the barycenter of its predecessors.
 */
function layout(g: ExecGraph) {
  const start = g.nodes.find((n) => n.type === "start");
  const end = g.nodes.find((n) => n.type === "end");
  if (!start) return;
  const observedIn = new Set(g.edges.filter((e) => e.source !== "doc").map((e) => e.to));
  const rankEdges = g.edges.filter((e) => e.source !== "doc" || !observedIn.has(e.to));
  const out = (id: string) => rankEdges.filter((e) => e.from === id).sort((a, b) => b.prob - a.prob);
  const back = new Set<string>();
  const state = new Map<string, 1 | 2>();
  const dfs = (id: string) => {
    state.set(id, 1);
    for (const e of out(id)) {
      const st = state.get(e.to);
      if (st === 1) back.add(e.id);
      else if (!st) dfs(e.to);
    }
    state.set(id, 2);
  };
  dfs(start.id);
  const dag = rankEdges.filter((e) => !back.has(e.id) && e.to !== end?.id);
  const level = new Map<string, number>([[start.id, 0]]);
  for (let pass = 0; pass < g.nodes.length; pass++) {
    let changed = false;
    for (const e of dag) {
      const l = level.get(e.from);
      if (l !== undefined && (level.get(e.to) ?? -1) < l + 1) {
        level.set(e.to, l + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const max = Math.max(0, ...level.values());
  if (end) level.set(end.id, max + 1);
  let orphan = max + 2;
  const layers = new Map<number, GNode[]>();
  for (const n of g.nodes) {
    const l = level.get(n.id) ?? orphan++;
    (layers.get(l) ?? layers.set(l, []).get(l)!).push(n);
  }
  const x = new Map<string, number>();
  for (const l of [...layers.keys()].sort((a, b) => a - b)) {
    const ns = layers.get(l)!;
    const want = (n: GNode) => {
      const ins = g.edges.filter((e) => e.to === n.id && x.has(e.from));
      if (!ins.length) return 0;
      const w = ins.map((e) => (e.source === "doc" ? 0.2 : 1) * Math.max(0.05, e.prob));
      return ins.reduce((s, e, k) => s + x.get(e.from)! * w[k], 0) / w.reduce((a, b) => a + b, 0);
    };
    const desired = ns.map((n) => ({ n, w: want(n) + (n.provenance.some((p) => p.source === "doc") && !n.count ? 120 : 0) - n.count * 2 }));
    desired.sort((a, b) => a.w - b.w);
    const gap = 270;
    const centre = desired.reduce((s, d) => s + d.w, 0) / desired.length;
    desired.forEach((d, k) => {
      const px = Math.round(centre + (k - (desired.length - 1) / 2) * gap);
      x.set(d.n.id, px);
      d.n.x = px;
      d.n.y = l * 150;
    });
  }
}
