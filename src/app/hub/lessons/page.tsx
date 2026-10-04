import Link from "next/link";
import { PageHeader } from "@/components/hub";
import { freshDB } from "@/lib/fresh";

const KIND = { walkthrough: "Walkthrough", drill: "Predict & quiz", quiz: "Quiz", delta: "What changed" } as const;

export default async function Lessons() {
  const d = await freshDB();
  return (
    <div className="space-y-4">
      <PageHeader title="Lessons" subtitle={<>Generated from the pages and the process graph, regenerated whenever a page changes. Live coaching on a real case happens in <Link href="/teach" className="underline">Teach</Link>.</>} />
      <div className="grid grid-cols-3 gap-3">
        {d.lessons.map((l) => (
          <Link key={l.id} href={`/hub/lessons/${l.id}`} className={`rounded-xl border bg-white p-4 shadow-sm hover:border-stone-400 ${l.kind === "delta" ? "border-amber-300" : "border-stone-200"}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{KIND[l.kind]}</div>
            <div className="mt-1 font-medium">{l.title}</div>
            <div className="mt-2 text-xs text-stone-500">{l.items.length} items · built on {l.basedOn.map((b) => `v${b.version}`).join(", ") || "graph"}</div>
          </Link>
        ))}
      </div>
      {!d.lessons.length && <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">Lessons appear after the first confirmed capture.</div>}
    </div>
  );
}
