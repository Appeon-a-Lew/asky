import Link from "next/link";
import { Card, PageHeader } from "@/components/hub";
import { freshDB } from "@/lib/fresh";
import BlacklistForm, { RemoveButton, SuggestionButtons } from "./BlacklistForm";

// Who is on the company blacklist, since when, and who said so. Pages keep the
// lasting rule ("blacklisted → hold"); this list keeps the changing facts.
export default async function Blacklist() {
  const d = await freshDB();
  const list = [...(d.blacklist ?? [])].sort((a, b) => (b.removedAt ?? b.addedAt) - (a.removedAt ?? a.addedAt));
  const current = list.filter((b) => !b.removedAt);
  const past = list.filter((b) => b.removedAt);
  const suppliers = [...new Set([...d.suppliers, ...(d.erp?.suppliers ?? [])].map((s) => s.name))].sort();
  const rules = d.pages.flatMap((p) => p.guardrails.filter((g) => JSON.stringify(g.rule ?? {}).includes("supplier.blacklisted")).map((g) => ({ p, g })));
  const fmt = (t: number) => new Date(t).toLocaleDateString();
  const suggestions = (d.blacklistSuggestions ?? []).filter((x) => x.status === "pending").sort((a, b) => b.at - a.at);
  const decided = (d.blacklistSuggestions ?? []).filter((x) => x.status !== "pending").sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0)).slice(0, 5);
  const session = (ids?: string[]) => ids?.map((id) => <Link key={id} href={`/hub/sessions/${id}`} className="ml-1 text-sky-700 underline">session</Link>);

  return (
    <div className="space-y-4">
      <PageHeader title="Supplier blacklist" subtitle={<>Who is blacklisted changes; the rule doesn&apos;t. Pages say <i>“invoices from blacklisted suppliers go on hold”</i> and check this list, so a supplier coming off it needs no page edit.</>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {suggestions.length > 0 && (
            <Card title={`asky heard a change (${suggestions.length})`} tone="info">
              <p className="mb-3 text-xs text-stone-600">Someone said this in a session. Nothing changes until a person applies it.</p>
              <ul className="space-y-3">
                {suggestions.map((x) => (
                  <li key={x.id} className="rounded-lg border border-sky-200 bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${x.action === "add" ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"}`}>{x.action === "add" ? "ADD" : "REMOVE"}</span>
                      <span className="font-medium">{x.supplierName}</span>
                      {x.unknownSupplier && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">not a known supplier — check the name</span>}
                      {x.reason && <span className="text-stone-500">— {x.reason}</span>}
                    </div>
                    <blockquote className="mt-1 italic text-stone-700">“{x.quote}”</blockquote>
                    <div className="mt-1 text-xs text-stone-500">{d.people.find((p) => p.id === x.personId)?.name ?? x.personId} · {new Date(x.at).toLocaleString()} · <Link href={`/hub/sessions/${x.sessionId}`} className="text-sky-700 underline">session</Link></div>
                    <div className="mt-2"><SuggestionButtons id={x.id} action={x.action} supplierName={x.supplierName} /></div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title={`On the blacklist now (${current.length})`} tone={current.length ? "warn" : undefined}>
            <table className="w-full text-sm [&_td]:py-2 [&_td]:pr-3">
              <tbody>
                {current.map((b) => (
                  <tr key={b.id} className="border-t border-stone-100 align-top first:border-0">
                    <td className="font-medium">{b.supplierName}</td>
                    <td className="text-stone-600">{b.reason}{b.source && <div className="text-xs text-stone-400">{b.source}</div>}</td>
                    <td className="whitespace-nowrap text-xs text-stone-500">since {fmt(b.addedAt)} · {b.addedBy}{session(b.sessionIds)}</td>
                    <td className="text-right"><RemoveButton supplierName={b.supplierName} /></td>
                  </tr>
                ))}
                {!current.length && <tr><td className="text-xs text-stone-400">No supplier is blacklisted right now.</td></tr>}
              </tbody>
            </table>
          </Card>
          <Card title="Taken off the list">
            <table className="w-full text-sm [&_td]:py-2 [&_td]:pr-3">
              <tbody>
                {past.map((b) => (
                  <tr key={b.id} className="border-t border-stone-100 align-top first:border-0">
                    <td className="font-medium text-stone-600">{b.supplierName}</td>
                    <td className="text-stone-500"><span className="line-through">{b.reason}</span><div className="text-xs">removed: {b.removedReason}</div></td>
                    <td className="whitespace-nowrap text-xs text-stone-500">{fmt(b.addedAt)} – {fmt(b.removedAt!)}<div>{b.addedBy} → {b.removedBy}{session(b.sessionIds)}</div></td>
                  </tr>
                ))}
                {!past.length && <tr><td className="text-xs text-stone-400">Nothing yet.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Add a supplier"><BlacklistForm suppliers={suppliers} /></Card>
          {decided.length > 0 && (
            <Card title="Decided suggestions">
              <ul className="space-y-1 text-xs text-stone-600">{decided.map((x) => <li key={x.id}>{x.status === "applied" ? "✓ applied" : "✗ dismissed"}: {x.action} {x.supplierName} <span className="text-stone-400">· {x.decidedBy}</span></li>)}</ul>
            </Card>
          )}
          <Card title="Rules that check this list">
            <ul className="space-y-2 text-sm">
              {rules.map(({ p, g }) => <li key={g.id}><Link href={`/hub/pages/${p.id}`} className="hover:underline">{g.text}</Link><div className="font-mono text-[11px] text-stone-500">before {g.rule!.onTool}{g.rule!.forbid ? " → forbidden" : ""}</div></li>)}
              {!rules.length && <li className="text-xs text-stone-400">No page rule uses supplier.blacklisted yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
