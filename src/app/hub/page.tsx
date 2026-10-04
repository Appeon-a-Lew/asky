import Link from "next/link";
import { Card, PageHeader, PageStatus } from "@/components/hub";
import { Icon } from "@/components/icons";
import { ago, freshDB, personName } from "@/lib/fresh";

export default async function HubOverview() {
  const d = await freshDB();
  const feed = d.pages
    .flatMap((p) => p.history.map((h) => ({ ...h, pageId: p.id, title: p.title })))
    .sort((a, b) => b.at - a.at)
    .slice(0, 12);
  const guardrails = d.pages.reduce((n, p) => n + p.guardrails.length, 0);
  const machine = d.pages.reduce((n, p) => n + p.guardrails.filter((g) => g.rule).length, 0);
  const single = d.pages.filter((p) => p.experts.length === 1 && p.status !== "stale");
  const captures = d.sessions.filter((s) => s.mode === "capture");
  const open = d.pages.flatMap((p) => p.openQuestions.map((q) => ({ q, page: p })));
  const review = d.pages.flatMap((p) => (p.conflicts ?? []).filter((c) => c.status !== "resolved").map((c) => ({ c, page: p })));
  const heard = (d.blacklistSuggestions ?? []).filter((x) => x.status === "pending");
  const mistakes = d.pages.flatMap((p) => p.mistakes.map((m) => ({ ...m, page: p }))).sort((a, b) => b.count - a.count).slice(0, 5);

  return (
    <div className="space-y-5">
      <PageHeader title="Knowledge hub" subtitle={<>What {d.people.filter((p) => p.kind === "expert").map((p) => p.name.split(" ")[0]).join(" and ")} know about invoice processing — captured from real work, confirmed in their own words, kept current.</>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {([
          ["Pages", d.pages.length, "/hub/pages", "pages", "situations"],
          ["Guardrails", `${machine}/${guardrails}`, "/hub/pages", "shield", "machine-checkable"],
          ["Graph", `v${d.graph.version}`, "/hub/graph", "graph", `${d.graph.traces.length} observed cases`],
          ["Sessions", captures.length, "/hub/sessions", "sessions", "captures"],
          ["Lessons", d.lessons.length, "/hub/lessons", "lessons", "generated"],
        ] as const).map(([l, v, h, icon, hint]) => (
          <Link key={l} href={h} className="group rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(28,27,24,0.04)] transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md">
            <div className="flex items-center justify-between text-xs font-medium text-stone-500">
              {l}
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100 group-hover:bg-amber-100"><Icon name={icon} className="h-3.5 w-3.5" /></span>
            </div>
            <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-stone-900">{v}</div>
            <div className="mt-1.5 text-[11px] text-stone-400">{hint}</div>
          </Link>
        ))}
      </div>

      {!d.pages.length && (
        <Card tone="info" title="Nothing captured yet">
          <p className="text-sm text-stone-600">Start with a <Link className="underline" href="/capture">capture session</Link> (an expert works a real queue) or a <Link className="underline" href="/interview">free-form interview</Link>. The only knowledge right now is the 2019 process document — see <Link className="underline" href="/hub/graph">its process graph</Link>.</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Pages" action={<Link className="text-xs text-sky-700 underline" href="/hub/pages">all pages</Link>}>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {d.pages.map((p) => (
                <Link key={p.id} href={`/hub/pages/${p.id}`} className="rounded-xl border border-stone-200/80 p-3.5 transition hover:border-stone-300 hover:bg-stone-50/60">
                  <div className="mb-1 flex items-center gap-2"><PageStatus status={p.status} /><span className="text-[11px] text-stone-400">v{p.version}</span></div>
                  <div className="font-medium leading-snug">{p.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-stone-500">{p.triggerText}</div>
                  <div className="mt-2 flex gap-2 text-[11px] text-stone-500">
                    <span>{p.guardrails.length} guardrails</span><span>{p.edgeCases.length} edge cases</span>{p.mistakes.length > 0 && <span className="text-rose-600">{p.mistakes.reduce((n, m) => n + m.count, 0)} new-hire mistakes</span>}
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {(review.length > 0 || heard.length > 0) && (
            <Card title="Needs review" tone="warn">
              <p className="mb-2 text-xs text-stone-600">Newer knowledge contradicts older knowledge. A person decides what is true now.</p>
              <ul className="space-y-2 text-sm">
                {review.map(({ c, page }) => (
                  <li key={c.id}>
                    <Link href={`/hub/pages/${page.id}`} className="font-medium hover:underline">{page.title}</Link>
                    <div className="text-xs text-stone-600"><span className={`mr-1 rounded px-1 py-0.5 text-[10px] font-semibold ${c.status === "disputed" ? "bg-orange-100 text-orange-800" : "bg-amber-100 text-amber-800"}`}>{c.status === "disputed" ? "DISPUTED" : "CHANGED"}</span>{c.summary}</div>
                  </li>
                ))}
                {heard.map((x) => (
                  <li key={x.id}>
                    <Link href="/hub/blacklist" className="font-medium hover:underline">Supplier blacklist</Link>
                    <div className="text-xs text-stone-600"><span className="mr-1 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-semibold text-sky-800">HEARD</span>{x.action === "add" ? "Blacklist" : "Take off the list"}: {x.supplierName} — “{x.quote}”</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="What changed">
            <ul className="space-y-2 text-sm">
              {feed.map((f, k) => (
                <li key={k}>
                  <Link href={`/hub/pages/${f.pageId}`} className="font-medium hover:underline">{f.title}</Link>
                  <div className="text-xs text-stone-500">v{f.version} · {f.summary} · {f.by} · {ago(f.at)}</div>
                </li>
              ))}
              {!feed.length && <li className="text-xs text-stone-400">No changes yet.</li>}
            </ul>
          </Card>
          {single.length > 0 && (
            <Card title="Bus factor" tone="warn">
              <p className="mb-2 text-xs text-stone-600">Knowledge only one person has confirmed. Capture a second expert before they retire.</p>
              <ul className="space-y-1 text-sm">{single.slice(0, 6).map((p) => <li key={p.id}><Link href={`/hub/pages/${p.id}`} className="hover:underline">{p.title}</Link> <span className="text-xs text-stone-500">— only {personName(d, p.experts[0])}</span></li>)}</ul>
            </Card>
          )}
          {mistakes.length > 0 && (
            <Card title="New hires get this wrong">
              <ul className="space-y-1 text-sm">{mistakes.map((m) => <li key={m.id}><span className="font-semibold tabular-nums text-rose-600">{m.count}×</span> {m.text}</li>)}</ul>
            </Card>
          )}
          {open.length > 0 && (
            <Card title="Open questions">
              <ul className="list-disc space-y-1 pl-4 text-sm">{open.slice(0, 6).map((o, k) => <li key={k}>{o.q}</li>)}</ul>
              <Link href="/interview" className="mt-2 inline-block text-xs text-sky-700 underline">ask them in a guided interview →</Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
