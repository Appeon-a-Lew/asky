import Link from "next/link";
import { PageHeader, PageStatus } from "@/components/hub";
import { describeCondition } from "@/lib/engine/context";
import { ago, freshDB, personName } from "@/lib/fresh";

export default async function PagesList() {
  const d = await freshDB();
  return (
    <div className="space-y-4">
      <PageHeader title="Pages" subtitle={<>One page per situation — the judgment calls, not the clicks. Each page updates itself as asky sees new edge cases.</>} />
      <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,27,24,0.04)]">
        <table className="w-full text-sm [&_td]:pr-4 [&_th]:py-2.5 [&_th]:pr-4">
          <thead className="bg-stone-50/80 text-left text-[11px] font-medium uppercase tracking-wider text-stone-500">
            <tr><th className="px-4 py-2">Situation</th><th>When (machine-checkable)</th><th>Guardrails</th><th>Experts</th><th>Status</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {d.pages.map((p) => (
              <tr key={p.id} className="border-t border-stone-100 align-top hover:bg-stone-50">
                <td className="px-4 py-2.5"><Link href={`/hub/pages/${p.id}`} className="font-medium hover:underline">{p.title}</Link><div className="text-xs text-stone-500">{p.triggerText}</div></td>
                <td className="py-2.5 font-mono text-[11px] text-stone-600">{p.triggers.map(describeCondition).join(" ∧ ") || "always"}</td>
                <td className="py-2.5">{p.guardrails.length}</td>
                <td className="py-2.5 text-xs">{p.experts.map((e) => personName(d, e)).join(", ")}</td>
                <td className="py-2.5"><PageStatus status={p.status} /> <span className="text-[11px] text-stone-400">v{p.version}</span>{p.conflicts?.some((c) => c.status === "review") && <div className="mt-1 text-[11px] font-medium text-amber-700">changed · needs review</div>}</td>
                <td className="py-2.5 text-xs text-stone-500">{ago(p.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!d.pages.length && <div className="p-8 text-center text-sm text-stone-400">No pages yet — run a capture session.</div>}
      </div>
    </div>
  );
}
