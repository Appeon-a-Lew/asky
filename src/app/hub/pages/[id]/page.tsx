import Link from "next/link";
import { notFound } from "next/navigation";
import { Blame, Card, PageStatus } from "@/components/hub";
import { describeCondition } from "@/lib/engine/context";
import { ago, freshDB, personName } from "@/lib/fresh";
import PageActions from "./PageActions";

const KIND: Record<string, { label: string; cls: string }> = {
  never: { label: "NEVER", cls: "bg-rose-600 text-white" },
  stop_and_ask: { label: "STOP & ASK", cls: "bg-amber-500 text-stone-900" },
  limit: { label: "LIMIT", cls: "bg-violet-600 text-white" },
  require: { label: "REQUIRED", cls: "bg-stone-800 text-white" },
};

export default async function PageView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await freshDB();
  const p = d.pages.find((x) => x.id === id);
  if (!p) notFound();
  const people = Object.fromEntries(d.people.map((x) => [x.id, x.name]));
  const frames = Object.fromEntries(d.sessions.flatMap((s) => s.frames.map((f) => [f.id, `/api/frames/${f.file}`])));
  const nodes = d.graph.nodes.filter((n) => n.pageIds.includes(p.id));
  const tools = Object.fromEntries((d.tools?.tools ?? []).map((t) => [t.name, t]));
  const heroQuote = p.why.flatMap((w) => w.provenance).find((x) => x.quote);
  const heroFrame = [...p.why, ...p.guardrails].flatMap((x) => x.provenance).find((x) => x.frameId && frames[x.frameId]);
  const blame = (prov: Parameters<typeof Blame>[0]["prov"]) => <Blame prov={prov} people={people} frames={frames} />;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-xs text-stone-500">
            <Link href="/hub/pages" className="hover:underline">Pages</Link><span>/</span><PageStatus status={p.status} /><span>v{p.version}</span><span>· updated {ago(p.updatedAt)}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.title}</h1>
          <p className="mt-1 text-stone-600">{p.situation}</p>
        </div>
        <PageActions pageId={p.id} status={p.status} />
      </div>

      {heroQuote && (
        <figure className="flex gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          {heroFrame?.frameId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={frames[heroFrame.frameId]} alt="screen moment" className="w-56 rounded border border-amber-200" />
          )}
          <div>
            <blockquote className="text-lg leading-snug text-amber-950">“{heroQuote.quote}”</blockquote>
            <figcaption className="mt-2 text-xs text-amber-800">— {personName(d, heroQuote.personId)}{heroQuote.ts ? `, ${new Date(heroQuote.ts).toLocaleDateString()}` : ""} {blame([heroQuote])}</figcaption>
          </div>
        </figure>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <Card title="When this applies">
            <p className="text-sm">{p.triggerText}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.triggers.map((c, k) => <code key={k} className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-700">{describeCondition(c)}</code>)}
              {!p.triggers.length && <span className="text-xs text-stone-400">applies to every invoice</span>}
            </div>
            {p.recognize.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-stone-500">How you recognize it on screen</div>
                <ul className="mt-1 list-disc pl-5 text-sm">{p.recognize.map((r) => <li key={r.id}>{r.text}</li>)}</ul>
              </div>
            )}
          </Card>

          <Card title="What to do">
            <ol className="space-y-2">
              {p.steps.map((s, k) => (
                <li key={s.id} className="flex items-start gap-3 text-sm">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-stone-900 text-xs text-white">{k + 1}</span>
                  <div>
                    {s.text}
                    {s.nodeId && <Link href={`/hub/graph?focus=${s.nodeId}`} className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 font-mono text-[10px] text-sky-700 hover:underline">{tools[s.nodeId]?.name ?? s.nodeId}</Link>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Why">
            <ul className="space-y-3">
              {p.why.map((w) => <li key={w.id} className="text-sm"><span className="italic">“{w.text}”</span> {blame(w.provenance)}</li>)}
            </ul>
          </Card>

          <Card title="Guardrails" tone={p.guardrails.length ? "warn" : undefined}>
            <ul className="space-y-3">
              {p.guardrails.map((g) => (
                <li key={g.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${KIND[g.kind].cls}`}>{KIND[g.kind].label}</span>
                    <span className="font-medium">{g.text}</span>
                    {g.contact && <span className="text-xs text-stone-500">→ {g.contact}</span>}
                    {blame(g.provenance)}
                  </div>
                  {g.rule && (
                    <div className="mt-1 font-mono text-[11px] text-stone-500">
                      before <b>{g.rule.onTool}</b> when {g.rule.when.map(describeCondition).join(" ∧ ")}
                      {g.rule.require?.length ? <> → require {g.rule.require.map(describeCondition).join(" ∧ ")}</> : null}
                      {g.rule.requirePriorTool ? <> → require prior <b>{g.rule.requirePriorTool}</b></> : null}
                      {g.rule.forbid ? <> → <b>forbidden</b></> : null}
                    </div>
                  )}
                </li>
              ))}
              {!p.guardrails.length && <li className="text-xs text-stone-400">No guardrails captured yet.</li>}
            </ul>
          </Card>

          {(p.edgeCases.length > 0 || p.troubleshooting.length > 0) && (
            <Card title="Edge cases & troubleshooting">
              <ul className="space-y-2 text-sm">
                {p.edgeCases.map((e) => <li key={e.id}>• {e.text} <span className="text-[11px] text-stone-400">learned {new Date(e.learnedAt).toLocaleDateString()}</span> {blame(e.provenance)}</li>)}
              </ul>
              {p.troubleshooting.length > 0 && (
                <table className="mt-3 w-full text-sm">
                  <thead className="text-left text-xs text-stone-500"><tr><th>Symptom</th><th>Cause</th><th>Fix</th><th /></tr></thead>
                  <tbody>{p.troubleshooting.map((t) => <tr key={t.id} className="border-t border-stone-100 align-top"><td className="py-1.5 pr-2">{t.symptom}</td><td className="pr-2">{t.cause}</td><td className="pr-2">{t.fix}{t.contact ? ` (${t.contact})` : ""}</td><td>{blame(t.provenance)}</td></tr>)}</tbody>
                </table>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Health">
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-stone-500">Experts</dt><dd>{p.experts.map((e) => personName(d, e)).join(", ") || "—"}</dd>
              <dt className="text-stone-500">Sessions</dt><dd>{new Set([...p.why, ...p.guardrails].flatMap((x) => x.provenance.map((y) => y.sessionId)).filter(Boolean)).size}</dd>
              <dt className="text-stone-500">Confirmed</dt><dd>{[...p.why, ...p.guardrails].filter((x) => x.provenance.some((y) => y.source === "confirmed")).length} / {p.why.length + p.guardrails.length} items</dd>
              <dt className="text-stone-500">In the graph</dt><dd>{nodes.length ? nodes.map((n) => <Link key={n.id} href={`/hub/graph?focus=${n.id}`} className="mr-1 text-sky-700 underline">{n.label}</Link>) : "—"}</dd>
            </dl>
            {p.experts.length === 1 && <p className="mt-2 rounded bg-rose-50 p-2 text-xs text-rose-800">Bus factor 1 — only one expert has confirmed this.</p>}
          </Card>

          {p.mistakes.length > 0 && (
            <Card title="Common new-hire mistakes" tone="warn">
              <ul className="space-y-1 text-sm">{p.mistakes.map((m) => <li key={m.id}><b className="tabular-nums text-rose-700">{m.count}×</b> {m.text}</li>)}</ul>
            </Card>
          )}

          {p.openQuestions.length > 0 && (
            <Card title="Open questions">
              <ul className="list-disc space-y-1 pl-4 text-sm">{p.openQuestions.map((q) => <li key={q}>{q}</li>)}</ul>
            </Card>
          )}

          <Card title="History">
            <ol className="space-y-2 text-xs">
              {[...p.history].reverse().map((h) => (
                <li key={h.version}><b>v{h.version}</b> · {h.summary}<div className="text-stone-500">{h.by} · {new Date(h.at).toLocaleString()}{h.sessionId && <> · <Link className="underline" href={`/hub/sessions/${h.sessionId}`}>session</Link></>}</div></li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
