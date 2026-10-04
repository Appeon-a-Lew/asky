"use client";

import {
  addEdge, Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, useEdgesState, useNodesState,
  type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExecGraph, GEdge, GNode, GNodeType, ToolDef } from "@/lib/types";

type NData = { g: GNode; tool?: ToolDef; pages: { id: string; title: string }[]; heat: number; grouped?: string; focus: boolean };

const STYLE: Record<GNodeType, string> = {
  start: "bg-stone-900 text-white rounded-full",
  end: "bg-stone-900 text-white rounded-full",
  action: "bg-white border-stone-300",
  decision: "bg-amber-50 border-amber-400 rotate-0",
  external_app: "bg-violet-50 border-violet-400",
  human_check: "bg-sky-50 border-sky-300 border-dashed",
  note: "bg-yellow-100 border-yellow-300 italic",
  guardrail: "bg-rose-50 border-rose-400",
  troubleshoot: "bg-orange-50 border-orange-400",
};

const ICON: Partial<Record<GNodeType, string>> = { decision: "◆", external_app: "⧉", human_check: "👁", note: "✎", guardrail: "⛔", troubleshoot: "🔧" };

function StepNode({ data, selected }: NodeProps<Node<NData>>) {
  const { g, tool, pages, heat, grouped, focus } = data;
  return (
    <div className={`min-w-[170px] max-w-[220px] rounded-lg border px-3 py-2 text-xs shadow-sm ${STYLE[g.type]} ${selected || focus ? "ring-2 ring-amber-400" : ""}`} style={{ boxShadow: heat ? `0 0 0 ${Math.round(heat * 6)}px rgba(14,165,233,${0.08 + heat * 0.2})` : undefined }}>
      <Handle type="target" position={Position.Top} className="!bg-stone-400" />
      <div className="flex items-center gap-1.5">
        {ICON[g.type] && <span>{ICON[g.type]}</span>}
        <span className="font-medium leading-tight">{g.label}</span>
      </div>
      {tool && (
        <div className="mt-1 flex items-center gap-1">
          <code className="text-[10px] text-stone-500">{tool.name}</code>
          {tool.effect === "irreversible" && <span className="rounded bg-rose-600 px-1 text-[9px] font-bold text-white">IRREVERSIBLE</span>}
        </div>
      )}
      {g.count > 0 && <div className="mt-0.5 text-[10px] text-stone-500">{g.count}× observed{g.avgMs ? ` · ${Math.round(g.avgMs / 1000)}s` : ""}</div>}
      {pages.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{pages.map((p) => <span key={p.id} className="rounded bg-amber-200 px-1 text-[9px] text-amber-900">⚑ {p.title.slice(0, 28)}</span>)}</div>}
      {grouped && <div className="mt-1 text-[9px] text-violet-700">⇄ {grouped}</div>}
      {g.description && g.type === "note" && <div className="mt-1 text-[10px]">{g.description}</div>}
      <Handle type="source" position={Position.Bottom} className="!bg-stone-400" />
    </div>
  );
}

const nodeTypes = { step: StepNode };

export default function GraphEditor({ initial, tools, pages, people, focus }: { initial: ExecGraph; tools: ToolDef[]; pages: { id: string; title: string; triggerText: string }[]; people: Record<string, string>; focus?: string }) {
  const toolMap = useMemo(() => Object.fromEntries(tools.map((t) => [t.name, t])), [tools]);
  const [graph, setGraph] = useState(initial);
  const [showDoc, setShowDoc] = useState(true);
  const [heat, setHeat] = useState(true);
  const [saved, setSaved] = useState<string>("");
  const [sel, setSel] = useState<{ kind: "node" | "edge"; id: string } | null>(focus ? { kind: "node", id: focus } : null);
  const maxCount = Math.max(1, ...graph.nodes.map((n) => n.count));

  const toFlowNodes = useCallback((g: ExecGraph): Node<NData>[] =>
    g.nodes.map((n) => {
      const grp = g.groups.find((x) => x.nodeIds.includes(n.id));
      return {
        id: n.id, type: "step", position: { x: n.x, y: n.y },
        data: { g: n, tool: n.tool ? toolMap[n.tool] : undefined, pages: pages.filter((p) => n.pageIds.includes(p.id)), heat: heat ? n.count / maxCount : 0, grouped: grp ? (grp.status === "unknown" ? "order? ask in debrief" : grp.status) : undefined, focus: focus === n.id || focus === n.tool },
      };
    }), [toolMap, pages, heat, maxCount, focus]);

  const toFlowEdges = useCallback((g: ExecGraph): Edge[] =>
    g.edges.filter((e) => showDoc || e.source !== "doc").map((e) => ({
      id: e.id, source: e.from, target: e.to,
      label: [e.count ? `${Math.round(e.prob * 100)}%` : e.source === "doc" ? "doc" : "", e.condition].filter(Boolean).join(" · "),
      labelStyle: { fontSize: 10 },
      labelBgStyle: { fill: "#fafaf9" },
      style: {
        strokeDasharray: e.source === "doc" ? "5 4" : undefined,
        stroke: e.source === "doc" ? "#a8a29e" : e.source === "expert_edit" ? "#e11d48" : "#0c4a6e",
        strokeWidth: e.source === "doc" ? 1.2 : 1 + Math.min(4, e.prob * 4),
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: e.source === "doc" ? "#a8a29e" : "#0c4a6e" },
      data: { e },
    })), [showDoc]);

  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(graph));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(graph));

  // re-render on view toggles (positions are kept in `nodes`)
  useEffect(() => {
    setEdges(toFlowEdges(graph));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDoc]);
  useEffect(() => {
    setNodes((ns) => toFlowNodes(graph).map((n) => ({ ...n, position: ns.find((x) => x.id === n.id)?.position ?? n.position })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heat]);

  const refresh = (g: ExecGraph) => {
    setGraph(g);
    setNodes(toFlowNodes(g));
    setEdges(toFlowEdges(g));
  };

  const currentGraph = (): ExecGraph => ({
    ...graph,
    nodes: graph.nodes.map((n) => {
      const fn = nodes.find((x) => x.id === n.id);
      return fn ? { ...n, x: Math.round(fn.position.x), y: Math.round(fn.position.y) } : n;
    }),
  });

  const onConnect = useCallback((c: Connection) => {
    const e: GEdge = { id: `${c.source}->${c.target}#edit${Date.now()}`, from: c.source!, to: c.target!, count: 0, prob: 0.5, experts: [], source: "expert_edit" };
    setGraph((g) => ({ ...g, edges: [...g.edges, e] }));
    setEdges((es) => addEdge({ ...c, id: e.id, style: { stroke: "#e11d48" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#e11d48" }, data: { e } }, es));
  }, [setEdges]);

  function addNode(type: GNodeType, label: string, tool?: string) {
    const g = currentGraph();
    const n: GNode = { id: `${type}_${Date.now().toString(36)}`, type, label, tool, pageIds: [], provenance: [{ source: "expert_edit", ts: Date.now() }], count: 0, x: 420, y: 60 + g.nodes.length * 20 };
    refresh({ ...g, nodes: [...g.nodes, n] });
    setSel({ kind: "node", id: n.id });
  }

  function updateNode(id: string, patch: Partial<GNode>) {
    const g = currentGraph();
    refresh({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  }
  function updateEdge(id: string, patch: Partial<GEdge>) {
    const g = currentGraph();
    refresh({ ...g, edges: g.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  }
  function remove() {
    if (!sel) return;
    const g = currentGraph();
    if (sel.kind === "node") refresh({ ...g, nodes: g.nodes.filter((n) => n.id !== sel.id), edges: g.edges.filter((e) => e.from !== sel.id && e.to !== sel.id) });
    else refresh({ ...g, edges: g.edges.filter((e) => e.id !== sel.id) });
    setSel(null);
  }

  async function save() {
    const g = currentGraph();
    const r = await fetch("/api/graph", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ nodes: g.nodes, edges: g.edges, groups: g.groups }) }).then((x) => x.json());
    setSaved(`saved v${r.version}`);
    setGraph({ ...g, version: r.version });
  }

  const selNode = sel?.kind === "node" ? graph.nodes.find((n) => n.id === sel.id || n.tool === sel.id) : undefined;
  const selEdge = sel?.kind === "edge" ? graph.edges.find((e) => e.id === sel.id) : undefined;
  const [newType, setNewType] = useState<GNodeType>("external_app");
  const [newLabel, setNewLabel] = useState("Check budget in Excel");

  return (
    <div className="flex gap-3">
      <div className="h-[72vh] min-w-0 flex-1 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,27,24,0.04)]">
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onNodeClick={(_, n) => setSel({ kind: "node", id: n.id })}
          onEdgeClick={(_, e) => setSel({ kind: "edge", id: e.id })}
          fitView fitViewOptions={{ padding: 0.15 }}
        >
          <Background gap={18} color="#e7e5e4" />
          <MiniMap pannable zoomable className="!bg-stone-50" />
          <Controls />
        </ReactFlow>
      </div>

      <aside className="w-80 shrink-0 space-y-3 text-sm">
        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1"><input type="checkbox" checked={showDoc} onChange={(e) => setShowDoc(e.target.checked)} /> 2019 doc path</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} /> frequency heat</label>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 rounded-md bg-stone-900 py-1.5 text-white">Save graph</button>
            {sel && <button onClick={remove} className="rounded-md border border-rose-300 px-3 text-rose-700">Delete</button>}
          </div>
          {saved && <div className="text-xs text-emerald-700">{saved}</div>}
        </div>

        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
          <div className="text-xs font-semibold text-stone-500">Add a step</div>
          <select value={newType} onChange={(e) => setNewType(e.target.value as GNodeType)} className="w-full rounded-md border border-stone-300 px-2 py-1">
            <option value="action">App function (MCP tool)</option>
            <option value="external_app">Other application (Excel, Word, Outlook…)</option>
            <option value="human_check">Human check</option>
            <option value="decision">Decision</option>
            <option value="guardrail">Guardrail / stop</option>
            <option value="note">Note</option>
          </select>
          {newType === "action" ? (
            <select value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="w-full rounded-md border border-stone-300 px-2 py-1">
              {tools.map((t) => <option key={t.name} value={t.name}>{t.title} ({t.name})</option>)}
            </select>
          ) : (
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="w-full rounded-md border border-stone-300 px-2 py-1" />
          )}
          <button onClick={() => newType === "action" ? addNode("action", toolMap[newLabel]?.title ?? newLabel, newLabel) : addNode(newType, newLabel)} className="w-full rounded-md border border-stone-300 py-1">+ Add, then connect it</button>
        </div>

        {selNode && (
          <div className="space-y-2 rounded-xl border border-amber-300 bg-white p-3 shadow-sm">
            <input value={selNode.label} onChange={(e) => updateNode(selNode.id, { label: e.target.value })} className="w-full rounded-md border border-stone-200 px-2 py-1 font-medium" />
            <div className="text-xs text-stone-500">{selNode.type}{selNode.tool ? ` · ${selNode.tool}` : ""} · {selNode.count}× observed</div>
            {selNode.tool && toolMap[selNode.tool] && <p className="text-xs text-stone-600">{toolMap[selNode.tool].description}</p>}
            <textarea value={selNode.description ?? ""} onChange={(e) => updateNode(selNode.id, { description: e.target.value })} placeholder="Notes about this step (why, how, which file to open…)" className="h-20 w-full rounded-md border border-stone-200 p-2 text-xs" />
            {selNode.pageIds.length > 0 && <div className="space-y-1">{pages.filter((p) => selNode.pageIds.includes(p.id)).map((p) => <Link key={p.id} href={`/hub/pages/${p.id}`} className="block text-xs text-sky-700 underline">⚑ {p.title}</Link>)}</div>}
            <div className="text-[11px] text-stone-400">source: {selNode.provenance.map((p) => p.source).join(", ")}</div>
          </div>
        )}

        {selEdge && (
          <div className="space-y-2 rounded-xl border border-amber-300 bg-white p-3 shadow-sm">
            <div className="font-medium">{graph.nodes.find((n) => n.id === selEdge.from)?.label} → {graph.nodes.find((n) => n.id === selEdge.to)?.label}</div>
            <dl className="grid grid-cols-2 gap-y-1 text-xs">
              <dt className="text-stone-500">Source</dt><dd>{selEdge.source}</dd>
              <dt className="text-stone-500">Probability</dt><dd>{Math.round(selEdge.prob * 100)}%</dd>
              <dt className="text-stone-500">Observed</dt><dd>{selEdge.count}×</dd>
              {selEdge.avgMs && <><dt className="text-stone-500">Avg / p90</dt><dd>{Math.round(selEdge.avgMs / 1000)}s / {Math.round((selEdge.p90Ms ?? 0) / 1000)}s</dd></>}
              <dt className="text-stone-500">Experts</dt><dd>{selEdge.experts.map((e) => people[e] ?? e).join(", ") || "—"}</dd>
            </dl>
            <input value={selEdge.condition ?? ""} onChange={(e) => updateEdge(selEdge.id, { condition: e.target.value })} placeholder="Condition (when is this path taken?)" className="w-full rounded-md border border-stone-200 px-2 py-1 text-xs" />
          </div>
        )}

        {graph.groups.length > 0 && (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs">
            <div className="mb-1 font-semibold text-violet-900">Order-independent steps</div>
            {graph.groups.map((g) => <div key={g.id}>{g.nodeIds.map((id) => graph.nodes.find((n) => n.id === id)?.label).join(" ⇄ ")}: <b>{g.status}</b>{g.note ? ` — “${g.note}”` : ""}</div>)}
          </div>
        )}
      </aside>
    </div>
  );

}
