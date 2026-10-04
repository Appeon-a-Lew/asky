import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import Shell from "@/components/Shell";
import { freshDB } from "@/lib/fresh";
import ResetButton from "./ResetButton";

const STEPS: { href: string; n: string; title: string; icon: IconName; text: string }[] = [
  { href: "/interview", n: "0", title: "Interview", icon: "mic", text: "Free-form: the expert explains their loops. Guided: asky asks exactly about what the hub is unsure of." },
  { href: "/capture", n: "1", title: "Capture", icon: "capture", text: "The expert works a real queue. asky stays quiet while they type or talk, and asks at natural pauses — big deviations live, small ones in the debrief." },
  { href: "/hub", n: "2", title: "Map", icon: "hub", text: "Debrief + teach-back → situation pages, an executable process graph on the app's own MCP, and a Work Map of every step." },
  { href: "/teach", n: "3", title: "Teach", icon: "teach", text: "A voice tutor watches the new hire, asks for predictions and stops a wrong decision before it is saved — in the expert's words." },
];

const PILLARS: { title: string; icon: IconName; text: React.ReactNode }[] = [
  {
    title: "Domain MCP, generated",
    icon: "tools",
    text: <>The harness crawls the app and its API and writes an MCP server: <code className="rounded bg-stone-100 px-1 text-[12px]">set_invoice_coding</code>, <code className="rounded bg-stone-100 px-1 text-[12px]">hold_invoice</code>, <code className="rounded bg-stone-100 px-1 text-[12px]">post_invoice</code> (irreversible)… Clicks become process steps; agents get the same tools, guarded.</>,
  },
  {
    title: "When to interrupt — in milliseconds",
    icon: "bolt",
    text: <>Each step is compared with the execution graph. Jev (TypeSafe&apos;s System-One model) or a rule scorer decides: ignore, ask now, ask before the irreversible step, or save for the debrief. Claude only phrases the question.</>,
  },
  {
    title: "Trust",
    icon: "shield",
    text: <>“Off the record” stops all capture and deletes that window. Personal data is blurred on screen and redacted from transcripts. Nothing becomes knowledge until the expert confirms the teach-back.</>,
  },
];

export default async function Home() {
  const d = await freshDB();
  const ready = {
    catalog: !!d.tools,
    pages: d.pages.length,
    sessions: d.sessions.filter((s) => s.mode === "capture" && s.phase === "done").length,
  };
  const recent = d.sessions.flatMap((s) => s.questions.filter((q) => q.answer && q.timing !== "debrief")).slice(-3);
  return (
    <Shell>
      <div className="mx-auto max-w-6xl space-y-12 px-8 py-12">
        <section className="grid items-center gap-10 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              AI Apprentice · ElevenLabs × Hack-Nation
            </div>
            <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight text-stone-900 xl:text-[44px]">Sabine retires in 18 months.<br /><span className="text-stone-400">Her judgment doesn&apos;t have to.</span></h1>
            <p className="max-w-xl text-lg leading-relaxed text-stone-600">asky watches how experts really work, asks <i>why</i> at the right moment, maps it onto the application&apos;s own functions, and teaches it to the next Lena — stopping her before a guardrail breaks.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/capture" className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800">
                <Icon name="capture" /> Start a capture
              </Link>
              <Link href="/hub" className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-800 shadow-sm transition hover:border-stone-400">
                Open the knowledge hub <Icon name="arrow" />
              </Link>
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,27,24,0.04),0_12px_32px_-12px_rgba(28,27,24,0.12)]">
              <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3 text-xs font-medium text-stone-500">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" /></span>
                Live from the last session
              </div>
              <div className="space-y-4 p-5 text-sm">
                {recent.map((q) => (
                  <div key={q.id} className="space-y-2">
                    <div className="flex gap-2.5">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-stone-900 text-[11px] font-bold text-amber-300">a</span>
                      <div className="rounded-xl rounded-tl-sm bg-amber-50 px-3 py-2 text-amber-950">{q.text}</div>
                    </div>
                    <div className="ml-8 rounded-xl rounded-tr-sm bg-stone-100 px-3 py-2 text-stone-700">“{q.answer!.slice(0, 140)}{q.answer!.length > 140 ? "…" : ""}”</div>
                  </div>
                ))}
                {!recent.length && <div className="py-6 text-center text-stone-500">No sessions yet. Capture one, or run <code className="rounded bg-stone-100 px-1">pnpm simulate</code> for a scripted demo.</div>}
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 text-xs font-medium uppercase tracking-wider text-stone-500">How it works</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <Link key={s.href} href={s.href} className="group relative rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,27,24,0.04)] transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md">
                <div className="mb-4 flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-stone-900 text-amber-300"><Icon name={s.icon} className="h-[18px] w-[18px]" /></span>
                  <span className="font-mono text-xs text-stone-300">0{s.n}</span>
                </div>
                <div className="flex items-center gap-1.5 font-semibold text-stone-900">{s.title}<Icon name="arrow" className="h-3.5 w-3.5 -translate-x-1 text-stone-400 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" /></div>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{s.text}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-4 text-sm lg:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-stone-200/80 bg-white/60 p-5">
              <div className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100"><Icon name={p.icon} /></div>
              <div className="font-semibold text-stone-900">{p.title}</div>
              <p className="mt-1 leading-relaxed text-stone-600">{p.text}</p>
              {p.icon === "tools" && <Link href="/hub/tools" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-amber-800 hover:underline">{ready.catalog ? "See the catalog" : "Not generated yet — run pnpm harness"}<Icon name="arrow" className="h-3.5 w-3.5" /></Link>}
            </div>
          ))}
        </section>

        <section className="flex items-center justify-between rounded-2xl border border-dashed border-stone-300 px-5 py-4 text-sm text-stone-600">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-stone-400">Demo status</span>
            <span className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${ready.catalog ? "bg-emerald-500" : "bg-rose-400"}`} />MCP catalog</span>
            <span><b className="tabular-nums text-stone-900">{ready.pages}</b> pages</span>
            <span><b className="tabular-nums text-stone-900">{ready.sessions}</b> confirmed captures</span>
          </div>
          <ResetButton />
        </section>
      </div>
    </Shell>
  );
}
