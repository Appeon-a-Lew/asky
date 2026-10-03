import Link from "next/link";
import { freshDB, personName } from "@/lib/fresh";

export default async function Sessions() {
  const d = await freshDB();
  const list = [...d.sessions].sort((a, b) => b.startedAt - a.startedAt);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Sessions & Work Maps</h1>
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500"><tr><th className="px-4 py-2">Session</th><th>Mode</th><th>Person</th><th>Started</th><th>Steps</th><th>Questions (live / debrief)</th><th>Phase</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} className="border-t border-stone-100 hover:bg-stone-50">
                <td className="px-4 py-2"><Link href={`/hub/sessions/${s.id}`} className="font-medium hover:underline">{s.title}</Link></td>
                <td>{s.mode.replace("_", " ")}</td>
                <td>{personName(d, s.personId)}</td>
                <td className="text-xs text-stone-500">{new Date(s.startedAt).toLocaleString()}</td>
                <td className="tabular-nums">{s.events.filter((e) => e.kind === "tool").length}</td>
                <td className="tabular-nums">{s.questions.filter((q) => q.timing !== "debrief" && q.status === "answered").length} / {s.questions.filter((q) => q.timing === "debrief" && q.status === "answered").length}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-[11px] ${s.phase === "done" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100"}`}>{s.phase}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <div className="p-8 text-center text-sm text-stone-400">No sessions yet.</div>}
      </div>
    </div>
  );
}
