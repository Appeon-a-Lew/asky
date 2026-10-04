import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import Shell from "@/components/Shell";
import { freshDB } from "@/lib/fresh";

// The audience's guide: four steps, each checked off from what this workspace already holds.
export default async function Start() {
  const d = await freshDB();
  const done = {
    interview: d.sessions.some((s) => s.recording && s.phase === "done"),
    capture: d.sessions.some((s) => s.mode === "capture" && s.phase === "done" && !s.endedEarly),
    pages: d.pages.length > 0,
    teach: d.sessions.some((s) => s.mode === "teach" && (s.teachResult?.caught.length ?? 0) > 0),
  };
  const steps: { key: keyof typeof done; href: string; icon: IconName; title: string; how: React.ReactNode }[] = [
    { key: "interview", href: "/interview", icon: "mic", title: "Interview — let the expert talk", how: <>Open <b>Recorded interview</b> and click <b>Import sample</b>: Sabine explains her month-end in German. asky transcribes it and writes English pages with her original quotes. Takes about a minute.</> },
    { key: "capture", href: "/capture", icon: "capture", title: "Capture — be the expert", how: <>Start a session (Ledgerline is preselected). Open <b>4471</b> and change the cost center to <b>0400</b> with an asset number, put <b>4473</b> on hold as a duplicate, post a routine one. Pause after each step: asky asks why. Answer by voice or type. Then <b>End task → debrief</b> and confirm the teach-back.</> },
    { key: "pages", href: "/hub/pages", icon: "pages", title: "Map — read what asky learned", how: <>Open a page. Every sentence links to who said it and when. The guardrails are rules that run as code. Look at the process graph and the Work Map of your session too.</> },
    { key: "teach", href: "/teach", icon: "teach", title: "Teach — be the new hire", how: <>Start training. Open <b>5101</b> and try to post it as it is — the tutor stops you before anything is saved, in the words you gave it.</> },
  ];
  const next = steps.find((s) => !done[s.key]);
  return (
    <Shell>
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-amber-700">Your private demo</div>
          <h1 className="mt-1 text-[30px] font-semibold leading-tight tracking-tight text-stone-900">Teach asky something. Then let it teach you.</h1>
          <p className="mt-2 text-stone-600">Four steps, about fifteen minutes. Everything happens in your own copy — nobody else sees it, and it&apos;s deleted after a few hours.</p>
        </div>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.key} className={`rounded-2xl border bg-white p-5 transition ${next?.key === s.key ? "border-amber-300 shadow-sm ring-4 ring-amber-100" : "border-stone-200"}`}>
              <div className="flex items-start gap-4">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${done[s.key] ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-600"}`}>{done[s.key] ? "✓" : <Icon name={s.icon} className="h-4 w-4" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Step {i + 1}{done[s.key] ? " · done" : ""}</div>
                  <h2 className="font-semibold text-stone-900">{s.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-stone-600">{s.how}</p>
                </div>
                <Link href={s.href} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${next?.key === s.key ? "bg-stone-900 text-white hover:bg-stone-800" : "border border-stone-300 text-stone-700 hover:bg-stone-50"}`}>{done[s.key] ? "Open" : "Go"}</Link>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-sm text-stone-500">Curious how it works on a real ERP? The <Link href="/" className="underline">home page</Link> shows asky on ERPNext — the same engine, watching only the screen.</p>
      </div>
    </Shell>
  );
}
