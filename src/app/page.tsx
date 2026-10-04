import Link from "next/link";
import HarnessDemo from "@/components/landing/HarnessDemo";
import HeroPlayer from "@/components/landing/HeroPlayer";
import JevDemo from "@/components/landing/JevDemo";
import PageDemo from "@/components/landing/PageDemo";
import SchmidtStory from "@/components/landing/SchmidtStory";
import StopDemo from "@/components/landing/StopDemo";
import TryForm from "@/components/landing/TryForm";
import VisionDemo from "@/components/landing/VisionDemo";
import data from "../../public/landing/data.json";

// The public landing page. Everything shown comes from real runs
// (scripts/build-landing.ts): ERPNext frames and asky's own readings of them,
// Jev's logged decisions, the generated harness, a confirmed page, the Schmidt story.

export const metadata = {
  title: "asky — the AI apprentice that learns your experts' judgment",
  description: "asky watches experts work in a real ERP, asks the right question at the right moment, and turns the answers into living knowledge a new hire or an AI agent can use.",
};

const FEATURES = [
  { id: "moment", n: "01", kicker: "Capture", title: "Asks at the right moment", text: "asky never interrupts someone mid-thought. It waits for a real pause, then a fast decision model chooses: ask now, ask before the irreversible step, save it for the debrief — or stay quiet because a page already explains it." },
  { id: "stop", n: "02", kicker: "Teach", title: "Stops the irreversible click", text: "Real apps don't ask permission before saving. asky watches for the last moment that still counts — the confirm dialog — and steps in there, in the expert's own words." },
  { id: "vision", n: "03", kicker: "Real apps", title: "Learns a real app from the screen alone", text: "On ERPNext, asky has no plugin and no instrumentation — only the shared screen. Vision reads each frame into a structured state, and the app's API confirms what was really saved." },
  { id: "harness", n: "04", kicker: "Harness", title: "Generates the app's MCP — automatically", text: "Point the harness at an app and it discovers what can be done there: every action as a tool, classified read, write or irreversible. Those tools become asky's vocabulary — and an MCP server for other agents." },
  { id: "pages", n: "05", kicker: "Map", title: "Pages: git blame for knowledge", text: "Knowledge lands on pages — one per judgment call — where every sentence remembers who said it, when, and what was on the screen." },
  { id: "schmidt", n: "06", kicker: "Living knowledge", title: "Knowledge that changes", text: "Experts contradict each other, and facts expire. asky notices, keeps the history, switches off outdated rules — and lets a person decide." },
] as const;

const MORE = [
  { title: "Interviews in any language", text: "A 3½-minute German interview becomes English pages with the original quotes — and every quote replays from the recording." },
  { title: "Execution graph", text: "The 2019 process document versus what really happens: probabilities, durations, and “does the order matter?” asked once, remembered forever." },
  { title: "Teach with predictions", text: "The tutor asks the new hire what the expert would do before they act, tracks mastery per page, and feeds their mistakes back into the pages." },
  { title: "Trust built in", text: "Say “off the record” and capture stops. IBANs and e-mails are blurred on screen. Nothing is saved until the expert confirms the teach-back." },
  { title: "Agent-ready", text: "Export the knowledge as an agent skill, or run the generated MCP server — its write tools refuse when a guardrail would be broken." },
  { title: "Voice that waits", text: "ElevenLabs listens (VAD, turn-taking); asky speaks only what it decided. Echo filtering, barge-in rules, and warnings that always win." },
];

export default async function Landing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const d = data;
  const capexGuard = d.page?.guardrails[0]?.text ?? "";
  const capexQuote = d.page?.why[0]?.quote ?? undefined;
  const aligned = d.harness ? `${d.harness.alignment.filter((a) => a.tools.length).length}/${d.harness.alignment.length}` : "";
  const read = d.frames.filter((f) => f.screen).length;

  return (
    <div className="bg-background text-foreground">
      {/* ── hero ── */}
      <header className="relative overflow-hidden bg-stone-950 text-stone-200">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.16),transparent_55%)]" />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-amber-300 to-amber-500 text-[15px] font-bold text-stone-950">a</span>
            <span className="text-[15px] font-semibold tracking-tight text-white">asky</span>
          </span>
          <div className="flex items-center gap-5 text-sm">
            <a href="#features" className="hidden text-stone-400 hover:text-white sm:inline">How it works</a>
            <a href="#try" className="rounded-lg bg-white/10 px-3 py-1.5 text-white ring-1 ring-white/15 hover:bg-white/15">Try it</a>
          </div>
        </nav>
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-2 lg:pb-24 lg:pt-10">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[12px] text-stone-400 ring-1 ring-white/10">Hack-Nation × ElevenLabs · The AI Apprentice</div>
            <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight text-white sm:text-[52px]">The apprentice that learns your experts&apos; judgment.</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-400">asky watches an expert work in a real ERP, asks the right question at the right moment, and turns the answers into living knowledge a new hire — or an AI agent — can use.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#try" className="rounded-xl bg-amber-400 px-5 py-3 font-medium text-stone-950 transition hover:bg-amber-300">Try it yourself</a>
              <a href="#features" className="rounded-xl px-5 py-3 font-medium text-white ring-1 ring-white/20 transition hover:bg-white/5">See how it works</a>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
              {[
                [`${d.decisions.medianMs} ms`, "to decide whether to interrupt"],
                [`${read}/${d.frames.length}`, "ERPNext screens read correctly"],
                [aligned, "steps found in the generated MCP"],
              ].map(([n, l]) => (
                <div key={l}>
                  <dt className="text-2xl font-semibold tracking-tight text-white">{n}</dt>
                  <dd className="mt-1 text-[12px] leading-snug text-stone-500">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroPlayer frames={d.frames} />
        </div>
      </header>

      {/* ── try it ── */}
      <section id="try" className="border-b border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-[28px] font-semibold tracking-tight text-stone-900">Try it yourself — in your own private workspace</h2>
            <p className="mt-3 text-stone-600">You get a fresh copy of asky with <b>Ledgerline</b>, a small accounts-payable app built into it. Be the expert, teach asky, then become the new hire and see if it stops you.</p>
            <div className="mt-6"><TryForm expired={sp.expired === "1"} /></div>
            <p className="mt-3 text-[13px] text-stone-500">Only you see your workspace. It&apos;s deleted after a few hours. No screen recording — Ledgerline reports its own clicks. The microphone is optional; you can type.</p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {[
              ["Interview", "Import the sample: a German expert interview becomes English knowledge pages."],
              ["Capture", "Work three invoices. asky asks at the pauses — answer by voice or by typing."],
              ["Map", "Confirm the teach-back and open your pages: every sentence links to who said it."],
              ["Teach", "Now be the new hire. Try to post the wrong invoice — and get stopped."],
            ].map(([t, x], i) => (
              <li key={t} className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Step {i + 1}</div>
                <div className="mt-0.5 font-semibold text-stone-900">{t}</div>
                <p className="mt-1 text-sm text-stone-600">{x}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── the six ── */}
      <main id="features" className="mx-auto max-w-6xl space-y-24 px-4 py-20 sm:px-6">
        {FEATURES.map((f) => (
          <section key={f.id} id={f.id} className="scroll-mt-8">
            <div className="mb-8 max-w-3xl">
              <div className="mb-2 flex items-center gap-3 text-[12px] font-semibold uppercase tracking-wider text-amber-700"><span className="font-mono text-stone-400">{f.n}</span>{f.kicker}</div>
              <h2 className="text-[30px] font-semibold leading-tight tracking-tight text-stone-900 sm:text-[36px]">{f.title}</h2>
              <p className="mt-3 text-lg leading-relaxed text-stone-600">{f.text}</p>
            </div>
            {f.id === "moment" && d.decisions.capex && <JevDemo d={d.decisions.capex} fallback={d.decisions.fallback} medianMs={d.decisions.medianMs} count={d.decisions.jevCount} />}
            {f.id === "stop" && <StopDemo guardrail={capexGuard} quote={capexQuote} expert="Sabine" />}
            {f.id === "vision" && <VisionDemo frames={d.frames} />}
            {f.id === "harness" && d.harness && <HarnessDemo h={d.harness} />}
            {f.id === "pages" && d.page && <PageDemo p={d.page} />}
            {f.id === "schmidt" && d.schmidt && <SchmidtStory s={d.schmidt} />}
          </section>
        ))}

        {/* ── also in the box ── */}
        <section>
          <h2 className="mb-6 text-[26px] font-semibold tracking-tight text-stone-900">Also in the box</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MORE.map((m) => (
              <div key={m.title} className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
                <div className="font-semibold text-stone-900">{m.title}</div>
                <p className="mt-1.5 text-sm text-stone-600">{m.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── architecture ── */}
        <section>
          <h2 className="mb-6 text-[26px] font-semibold tracking-tight text-stone-900">How it fits together</h2>
          <Architecture />
        </section>

        <section className="rounded-3xl bg-stone-950 px-6 py-12 text-center text-stone-200 sm:px-10">
          <h2 className="text-[28px] font-semibold tracking-tight text-white">Teach it something. Then let it teach you.</h2>
          <p className="mx-auto mt-3 max-w-xl text-stone-400">Fifteen minutes, a private workspace, nothing to install.</p>
          <a href="#try" className="mt-6 inline-block rounded-xl bg-amber-400 px-5 py-3 font-medium text-stone-950 hover:bg-amber-300">Try it yourself</a>
        </section>
      </main>

      <footer className="border-t border-stone-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-[13px] text-stone-500 sm:px-6">
          <span>asky — built for Hack-Nation × ElevenLabs, “The AI Apprentice”. Claude · ElevenLabs · TypeSafe Jev · ERPNext.</span>
          <Link href="/presenter" className="hover:text-stone-900">Presenter</Link>
        </div>
      </footer>
    </div>
  );
}

function Architecture() {
  const box = (x: number, y: number, w: number, title: string, lines: string[], tone: "dark" | "amber" | "light" = "light") => (
    <g key={title}>
      <rect x={x} y={y} width={w} height={44 + lines.length * 18} rx={14} className={tone === "dark" ? "fill-stone-900" : tone === "amber" ? "fill-amber-50 stroke-amber-300" : "fill-white stroke-stone-300"} strokeWidth={1} />
      <text x={x + 16} y={y + 24} className={`text-[14px] font-semibold ${tone === "dark" ? "fill-white" : "fill-stone-900"}`}>{title}</text>
      {lines.map((l, i) => <text key={l} x={x + 16} y={y + 46 + i * 18} className={`text-[12px] ${tone === "dark" ? "fill-stone-400" : "fill-stone-600"}`}>{l}</text>)}
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number) => <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-stone-400" strokeWidth={1.5} markerEnd="url(#arr)" />;
  return (
    <div className="overflow-x-auto rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <svg viewBox="0 0 960 310" className="min-w-[760px]" role="img" aria-label="asky architecture: the expert's app feeds Capture, Map and Teach, all speaking the generated MCP vocabulary">
        <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="fill-stone-400" /></marker></defs>
        {box(20, 30, 200, "Expert's app", ["ERPNext (screen + read API)", "Ledgerline (instrumented)", "voice: ElevenLabs"], "dark")}
        {box(270, 20, 200, "Capture", ["vision → state → steps", "deviations vs the graph", "Jev / rules: when to ask", "pre-commit gate"], "amber")}
        {box(520, 20, 200, "Map", ["debrief + teach-back", "pages with provenance", "execution graph", "conflicts · blacklist"], "amber")}
        {box(770, 20, 170, "Teach", ["predictions", "tutor stops mistakes", "mastery · lessons"], "amber")}
        {box(270, 200, 450, "Domain MCP (generated by the harness)", ["read · write · irreversible tools — one shared vocabulary"])}
        {box(770, 200, 170, "Agents", ["MCP server + skill", "guardrails enforced"])}
        {arrow(220, 70, 268, 70)}
        {arrow(470, 70, 518, 70)}
        {arrow(720, 70, 768, 70)}
        {arrow(370, 198, 370, 139)}
        {arrow(620, 198, 620, 139)}
        {arrow(720, 231, 768, 231)}
      </svg>
    </div>
  );
}
