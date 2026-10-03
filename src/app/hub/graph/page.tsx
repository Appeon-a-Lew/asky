import { freshDB } from "@/lib/fresh";
import GraphEditor from "./GraphEditor";

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const { focus } = await searchParams;
  const d = await freshDB();
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Process graph</h1>
        <p className="text-sm text-stone-500">{d.graph.process} · v{d.graph.version} · {d.graph.traces.length} observed cases. Dashed = the 2019 document, solid = what experts actually do. Every step is a tool of the generated domain MCP.</p>
      </div>
      <GraphEditor
        initial={d.graph}
        focus={focus}
        tools={d.tools?.tools ?? []}
        pages={d.pages.map((p) => ({ id: p.id, title: p.title, triggerText: p.triggerText }))}
        people={Object.fromEntries(d.people.map((p) => [p.id, p.name]))}
      />
    </div>
  );
}
