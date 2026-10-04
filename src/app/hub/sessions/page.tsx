import Link from "next/link";
import { PageHeader } from "@/components/hub";
import { freshDB, personName } from "@/lib/fresh";

export default async function Sessions() {
  const d = await freshDB();
  const list = [...d.sessions].sort((a, b) => b.startedAt - a.startedAt);
  return (
    <div className="space-y-4">
      <PageHeader title="Sessions & Work Maps" subtitle="Every capture, interview and training session — open one to replay its Work Map step by step." />
      <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,27,24,0.04)]">
        <table className="w-full text-sm [&_td]:pr-4 [&_th]:py-2.5 [&_th]:pr-4">
          <thead className="bg-stone-50/80 text-left text-[11px] font-medium uppercase tracking-wider text-stone-500"><tr><th className="px-4 py-2">Session</th><th>Mode</th><th>Person</th><th>Started</th><th>Steps</th><th>Questions (live / debrief)</th><th>Phase</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} className="border-t border-stone-100 hover:bg-stone-50">
                <td className="px-4 py-2"><Link href={`/hub/sessions/${s.id}`} className="font-medium hover:underline">{s.title}</Link></td>
                <td>{s.mode.replace("_", " ")}</td>
                <td>{personName(d, s.personId)}</td>
                <td className="text-xs text-stone-500">{new Date(s.startedAt).toLocaleString()}</td>
                <td className="tabular-nums">{s.events.filter((e) => e.kind === "tool").length}</td>
                <td className="tabular-nums">{s.questions.filter((q) => q.timing !== "debrief" && q.status === "answered").length} / {s.questions.filter((q) => q.timing === "debrief" && q.status === "answered").length}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-[11px] ${s.phase === "done" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100"}`}>{s.endedEarly ? "ended early" : s.phase}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <div className="p-8 text-center text-sm text-stone-400">No sessions yet.</div>}
      </div>
    </div>
  );
}
