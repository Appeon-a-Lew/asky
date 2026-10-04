import Link from "next/link";
import { Card, PageHeader } from "@/components/hub";
import { freshDB } from "@/lib/fresh";

// Who knows what — and which knowledge sits with only one person.
export default async function People() {
  const d = await freshDB();
  const experts = d.people.filter((p) => p.kind === "expert");
  return (
    <div className="space-y-4">
      <PageHeader title="People & coverage" subtitle={<>Every page knows whose words it is built on. Pages with a single expert are the knowledge that walks out of the door.</>} />
      <Card title="Expertise map">
        <table className="w-full text-sm [&_td]:pr-4 [&_th]:py-2.5 [&_th]:pr-4">
          <thead className="text-left text-xs text-stone-500"><tr><th className="py-1">Page</th>{experts.map((e) => <th key={e.id} className="text-center">{e.name}</th>)}<th className="text-center">Bus factor</th></tr></thead>
          <tbody>
            {d.pages.map((p) => (
              <tr key={p.id} className="border-t border-stone-100">
                <td className="py-1.5"><Link href={`/hub/pages/${p.id}`} className="hover:underline">{p.title}</Link></td>
                {experts.map((e) => <td key={e.id} className="text-center">{p.experts.includes(e.id) ? "●" : <span className="text-stone-300">○</span>}</td>)}
                <td className={`text-center font-semibold ${p.experts.length < 2 ? "text-rose-600" : "text-emerald-700"}`}>{p.experts.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid grid-cols-3 gap-3">
        {d.people.map((p) => {
          const sessions = d.sessions.filter((s) => s.personId === p.id);
          return (
            <Card key={p.id} title={p.name}>
              <div className="text-sm text-stone-600">{p.role}{p.years ? ` · ${p.years} years` : ""}</div>
              <div className="mt-2 text-xs text-stone-500">{sessions.length} sessions · {d.pages.filter((x) => x.experts.includes(p.id)).length} pages</div>
              {p.kind === "learner" && (
                <div className="mt-2 text-xs">
                  {sessions.flatMap((s) => s.teachResult?.mastery ?? []).slice(-6).map((m, k) => <div key={k}>{m.level === "mastered" ? "✅" : m.level === "practicing" ? "🟡" : "⚪"} {m.title}</div>)}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
