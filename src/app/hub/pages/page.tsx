import Link from "next/link";
import { PageStatus } from "@/components/hub";
import { describeCondition } from "@/lib/engine/context";
import { ago, freshDB, personName } from "@/lib/fresh";

export default async function PagesList() {
  const d = await freshDB();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pages</h1>
        <p className="text-sm text-stone-500">One page per situation — the judgment calls, not the clicks. Each page updates itself as asky sees new edge cases.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500">
            <tr><th className="px-4 py-2">Situation</th><th>When (machine-checkable)</th><th>Guardrails</th><th>Experts</th><th>Status</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {d.pages.map((p) => (
              <tr key={p.id} className="border-t border-stone-100 align-top hover:bg-stone-50">
                <td className="px-4 py-2.5"><Link href={`/hub/pages/${p.id}`} className="font-medium hover:underline">{p.title}</Link><div className="text-xs text-stone-500">{p.triggerText}</div></td>
                <td className="py-2.5 font-mono text-[11px] text-stone-600">{p.triggers.map(describeCondition).join(" ∧ ") || "always"}</td>
                <td className="py-2.5">{p.guardrails.length}</td>
                <td className="py-2.5 text-xs">{p.experts.map((e) => personName(d, e)).join(", ")}</td>
                <td className="py-2.5"><PageStatus status={p.status} /> <span className="text-[11px] text-stone-400">v{p.version}</span></td>
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
