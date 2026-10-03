import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/hub";
import { freshDB, personName } from "@/lib/fresh";
import type { Session } from "@/lib/types";
import WorkMapView from "./WorkMapView";

const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await freshDB();
  const s = d.sessions.find((x) => x.id === id) as Session | undefined;
  if (!s) notFound();
  const frames = Object.fromEntries(s.frames.map((f) => [f.id, `/api/frames/${f.file}`]));
  const live = s.questions.filter((q) => q.timing !== "debrief" && (q.status === "answered" || q.status === "asked"));
  const debrief = s.questions.filter((q) => q.timing === "debrief" && q.status === "answered");
  const decisions = s.questions.filter((q) => q.decision);
  const avgLatency = decisions.length ? decisions.reduce((a, q) => a + (q.decision?.latencyMs ?? 0), 0) / decisions.length : 0;
  const engines = [...new Set(decisions.map((q) => q.decision!.engine))];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-stone-500"><Link href="/hub/sessions" className="hover:underline">Sessions</Link> / {s.mode.replace("_", " ")}</div>
        <h1 className="text-2xl font-semibold tracking-tight">{s.workMap ? "Work Map — " : ""}{s.title}</h1>
        <p className="text-sm text-stone-500">{personName(d, s.personId)} · {new Date(s.startedAt).toLocaleString()} · {s.events.filter((e) => e.kind === "tool").length} steps · {live.length} live questions · {debrief.length} debrief answers{s.offRecord.length ? ` · ${s.offRecord.length}× off the record` : ""}</p>
      </div>

      {s.workMap?.summary && <Card tone="info"><p className="text-sm">{s.workMap.summary}</p></Card>}

      {s.workMap ? (
        <WorkMapView
          steps={s.workMap.steps.map((st) => ({ ...st, when: mmss(st.offsetMs), reasonWhen: st.reason?.ts ? mmss(st.reason.ts - s.startedAt) : undefined, frame: st.frameId ? frames[st.frameId] : undefined }))}
          expert={personName(d, s.personId).split(" ")[0]}
          pages={Object.fromEntries(d.pages.map((p) => [p.id, p.title]))}
        />
      ) : (
        <Card title="Steps">
          <ul className="space-y-1 text-sm">{s.events.filter((e) => e.kind !== "ui").map((e) => <li key={e.id} id={e.id}><span className="mr-2 font-mono text-xs text-stone-400">{mmss(e.ts - s.startedAt)}</span>{e.summary}</li>)}</ul>
          <p className="mt-3 text-xs text-stone-500">The Work Map is built when the expert confirms the teach-back.</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card title={`Interruption decisions (${engines.join(" + ") || "—"}, avg ${avgLatency.toFixed(1)} ms)`}>
          <table className="w-full text-xs">
            <thead className="text-left text-stone-500"><tr><th>at</th><th>deviation</th><th>decision</th><th>rules said</th><th>imp.</th></tr></thead>
            <tbody>
              {decisions.map((q) => (
                <tr key={q.id} className="border-t border-stone-100 align-top">
                  <td className="py-1 font-mono">{mmss(q.ts - s.startedAt)}</td>
                  <td>{q.decision!.deviationType}<div className="text-stone-400">{q.deviation?.detail}</div></td>
                  <td><b>{q.decision!.action}</b><div className="text-stone-400">{q.decision!.engine} · {q.decision!.latencyMs} ms{q.decision!.confidence ? ` · conf ${q.decision!.confidence.toFixed(2)}` : ""}</div></td>
                  <td>{q.decision!.rulesAction}</td>
                  <td className="tabular-nums">{q.importance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Transcript">
          <ul className="max-h-96 space-y-1.5 overflow-y-auto text-sm">
            {s.transcript.map((u) => (
              <li key={u.id} id={u.id}><span className="mr-2 font-mono text-xs text-stone-400">{mmss(u.ts - s.startedAt)}</span><span className={`mr-1 text-xs font-semibold ${u.speaker === "agent" ? "text-amber-700" : "text-stone-700"}`}>{u.speaker === "agent" ? "asky" : personName(d, s.personId).split(" ")[0]}</span>{u.text}</li>
            ))}
          </ul>
          {s.offRecord.length > 0 && <p className="mt-2 text-xs text-stone-500">Off-the-record windows were removed: {s.offRecord.map((o) => `${mmss(o.from - s.startedAt)}–${o.to ? mmss(o.to - s.startedAt) : "…"}`).join(", ")}</p>}
        </Card>
      </div>

      {s.teachBack && (
        <Card title={`Teach-back ${s.teachBack.confirmed ? "✓ confirmed" : "(not confirmed)"}`} tone={s.teachBack.confirmed ? "ok" : undefined}>
          <p className="text-sm">{s.teachBack.text}</p>
          {s.teachBack.corrections && <p className="mt-2 text-xs text-stone-600">Corrections: “{s.teachBack.corrections}”</p>}
        </Card>
      )}

      {s.teachResult && (
        <Card title="Tutor caught">
          <ul className="space-y-1 text-sm">{s.teachResult.caught.map((c, k) => <li key={k}>🛑 invoice {c.caseId}: before <code>{c.tool}</code> — {c.explanation} (<Link className="underline" href={`/hub/pages/${c.pageId}`}>page</Link>)</li>)}</ul>
        </Card>
      )}
    </div>
  );
}
