import Link from "next/link";
import Shell from "@/components/Shell";
import { freshDB } from "@/lib/fresh";
import ResetButton from "./ResetButton";

const STEPS = [
  { href: "/interview", n: "0", title: "Interview", text: "Free-form: the expert explains their loops. Guided: asky asks exactly about what the hub is unsure of." },
  { href: "/capture", n: "1", title: "Capture", text: "The expert works a real queue. asky stays quiet while they type or talk, and asks at natural pauses — big deviations live, small ones in the debrief." },
  { href: "/hub", n: "2", title: "Map", text: "Debrief + teach-back → situation pages, an executable process graph on the app's own MCP, and a Work Map of every step." },
  { href: "/teach", n: "3", title: "Teach", text: "A voice tutor watches the new hire, asks for predictions and stops a wrong decision before it is saved — in the expert's words." },
];

export default async function Home() {
  const d = await freshDB();
  const ready = {
    catalog: !!d.tools,
    pages: d.pages.length,
    sessions: d.sessions.filter((s) => s.mode === "capture" && s.phase === "done").length,
  };
  return (
    <Shell>
      <div className="mx-auto max-w-6xl space-y-10 px-5 py-10">
        <section className="grid grid-cols-5 items-center gap-10">
          <div className="col-span-3 space-y-5">
            <div className="text-sm font-medium text-amber-700">AI Apprentice · ElevenLabs × Hack-Nation</div>
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">Sabine retires in 18 months.<br /><span className="text-stone-400">Her judgment doesn&apos;t have to.</span></h1>
            <p className="max-w-xl text-lg text-stone-600">asky watches how experts really work, asks <i>why</i> at the right moment, maps it onto the application&apos;s own functions, and teaches it to the next Lena — stopping her before a guardrail breaks.</p>
            <div className="flex gap-3">
              <Link href="/capture" className="rounded-lg bg-stone-900 px-5 py-2.5 font-medium text-white">Start a capture</Link>
              <Link href="/hub" className="rounded-lg border border-stone-300 bg-white px-5 py-2.5 font-medium">Open the knowledge hub</Link>
            </div>
          </div>
          <div className="col-span-2 space-y-2 rounded-2xl border border-stone-200 bg-white p-5 text-sm shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">Live from the last session</div>
            {d.sessions.flatMap((s) => s.questions.filter((q) => q.answer && q.timing !== "debrief")).slice(-3).map((q) => (
              <div key={q.id} className="space-y-1 border-b border-stone-100 pb-2 last:border-0">
                <div className="text-amber-800">asky: “{q.text}”</div>
                <div className="text-stone-700">“{q.answer!.slice(0, 140)}{q.answer!.length > 140 ? "…" : ""}”</div>
              </div>
            ))}
            {!d.sessions.length && <div className="text-stone-500">No sessions yet. Capture one, or run <code>pnpm simulate</code> for a scripted demo.</div>}
          </div>
        </section>

        <section className="grid grid-cols-4 gap-3">
          {STEPS.map((s) => (
            <Link key={s.href} href={s.href} className="group rounded-xl border border-stone-200 bg-white p-5 shadow-sm hover:border-stone-400">
              <div className="mb-3 grid h-8 w-8 place-items-center rounded-full bg-stone-900 text-sm text-amber-300">{s.n}</div>
              <div className="font-semibold">{s.title}</div>
              <p className="mt-1 text-sm text-stone-600">{s.text}</p>
            </Link>
          ))}
        </section>

        <section className="grid grid-cols-3 gap-4 text-sm">
          <div className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="font-semibold">Domain MCP, generated</div>
            <p className="mt-1 text-stone-600">The harness crawls the app and its API and writes an MCP server: <code>set_invoice_coding</code>, <code>hold_invoice</code>, <code>post_invoice</code> (irreversible)… Clicks become process steps; agents get the same tools, guarded.</p>
            <Link href="/hub/tools" className="mt-2 inline-block text-sky-700 underline">{ready.catalog ? "see the catalog" : "not generated yet — run pnpm harness"}</Link>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="font-semibold">When to interrupt — in milliseconds</div>
            <p className="mt-1 text-stone-600">Each step is compared with the execution graph. Jev (TypeSafe&apos;s System-One model) or a rule scorer decides: ignore, ask now, ask before the irreversible step, or save for the debrief. Claude only phrases the question.</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="font-semibold">Trust</div>
            <p className="mt-1 text-stone-600">“Off the record” stops all capture and deletes that window. Personal data is blurred on screen and redacted from transcripts. Nothing becomes knowledge until the expert confirms the teach-back.</p>
          </div>
        </section>

        <section className="flex items-center justify-between rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-600">
          <div>Demo status: MCP catalog {ready.catalog ? "✓" : "✗"} · {ready.pages} pages · {ready.sessions} confirmed captures</div>
          <ResetButton />
        </section>
      </div>
    </Shell>
  );
}
