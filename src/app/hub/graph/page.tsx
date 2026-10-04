import { PageHeader } from "@/components/hub";
import { freshDB } from "@/lib/fresh";
import GraphEditor from "./GraphEditor";

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const { focus } = await searchParams;
  const d = await freshDB();
  return (
    <div className="space-y-3">
      <PageHeader title="Process graph" subtitle={<>{d.graph.process} · v{d.graph.version} · {d.graph.traces.length} observed cases. Dashed = the 2019 document, solid = what experts actually do. Every step is a tool of the generated domain MCP.</>} />
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
