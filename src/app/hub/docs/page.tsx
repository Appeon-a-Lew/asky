import { Card, PageHeader } from "@/components/hub";
import { freshDB } from "@/lib/fresh";

// Company docs next to reality: where the written process and the observed
// process disagree ("drift"), with the expert's reason when we have it.
export default async function Docs() {
  const d = await freshDB();
  const g = d.graph;
  const label = (id: string) => g.nodes.find((n) => n.id === id)?.label ?? id;
  const docEdges = g.edges.filter((e) => e.source === "doc");
  const observed = g.edges.filter((e) => e.source === "observed");
  const unusedDoc = g.traces.length ? docEdges.filter((e) => !observed.some((o) => o.from === e.from && o.to === e.to)) : [];
  const undocumented = observed.filter((o) => !docEdges.some((e) => e.from === o.from && e.to === o.to));
  const contradictions = d.sessions.flatMap((s) => s.questions.filter((q) => q.decision?.deviationType === "doc_contradiction" || q.deviation?.type === "doc_contradiction").map((q) => ({ q, s })));

  return (
    <div className="space-y-4">
      <PageHeader title="Docs & drift" subtitle={<>The official documentation is one input — and it is usually outdated. asky shows where reality differs.</>} />
      {g.traces.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card title="Doc contradicted by experts" tone="warn">
            <ul className="space-y-2 text-sm">
              {contradictions.map(({ q }) => <li key={q.id}><div className="text-xs text-stone-500">{q.deviation?.detail}</div>{q.answer && <div className="italic">“{q.answer}”</div>}</li>)}
              {!contradictions.length && <li className="text-xs text-stone-400">none</li>}
            </ul>
          </Card>
          <Card title="Done in reality, missing from the doc">
            <ul className="space-y-1 text-sm">{undocumented.map((e) => <li key={e.id}>{label(e.from)} → <b>{label(e.to)}</b> <span className="text-xs text-stone-500">{e.count}×</span></li>)}</ul>
          </Card>
          <Card title="In the doc, never observed">
            <ul className="space-y-1 text-sm">{unusedDoc.map((e) => <li key={e.id}>{label(e.from)} → {label(e.to)}{e.condition ? <span className="text-xs text-stone-500"> ({e.condition})</span> : null}</li>)}</ul>
          </Card>
        </div>
      )}
      {d.docs.map((doc) => (
        <Card key={doc.id} title={doc.title} action={<span className="text-xs text-stone-500">{doc.source}</span>}>
          <pre className="whitespace-pre-wrap font-sans text-sm text-stone-700">{doc.content}</pre>
        </Card>
      ))}
    </div>
  );
}
