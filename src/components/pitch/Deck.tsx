"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import HarnessDemo from "@/components/landing/HarnessDemo";
import HeroPlayer from "@/components/landing/HeroPlayer";
import JevDemo from "@/components/landing/JevDemo";
import PageDemo from "@/components/landing/PageDemo";
import SchmidtStory from "@/components/landing/SchmidtStory";
import StopDemo from "@/components/landing/StopDemo";
import VisionDemo from "@/components/landing/VisionDemo";
import type { LandingData } from "@/components/landing/types";

// A 1600×900 stage scaled to the screen. Only the current slide is mounted, so
// every landing animation starts fresh when its slide comes up.
//   → / space / PageDown   next          ← / PageUp   back
//   F   fullscreen         N   speaker notes + timer        T   restart the timer
// The first seven slides are the 3-minute pitch; the rest are backup for questions.

const W = 1600, H = 900;
const URL_SHORT = "asky.2-31-1-203.sslip.io";

type Slide = { id: string; secs: number; dark: boolean; backup?: boolean; notes: string; body: (d: LandingData) => React.ReactNode };

const Kicker = ({ children, dark = true }: { children: React.ReactNode; dark?: boolean }) => (
  <div className={`mb-4 text-[18px] font-semibold uppercase tracking-[0.18em] ${dark ? "text-amber-300" : "text-amber-700"}`}>{children}</div>
);

const Logo = ({ size = 44 }: { size?: number }) => (
  <span className="flex items-center gap-3">
    <span className="grid place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 font-bold text-stone-950" style={{ width: size, height: size, fontSize: size * 0.48 }}>a</span>
    <span className="font-semibold tracking-tight text-white" style={{ fontSize: size * 0.5 }}>asky</span>
  </span>
);

const Source = ({ children }: { children: React.ReactNode }) => <div className="absolute bottom-8 left-20 text-[14px] text-stone-500">{children}</div>;

const SLIDES: Slide[] = [
  {
    id: "hook",
    secs: 15,
    dark: true,
    notes: "Every company has a Sabine: twenty-four years in accounts payable, retiring in eighteen months. Ask her how she does it and she says: “don't ask me — I just know.” So we built asky. Spelled A-S-K-Y, said “ask why”.",
    body: (d) => (
      <div className="grid h-full grid-cols-[1fr_1.05fr] items-center gap-16 px-20">
        <div>
          <Logo />
          <h1 className="mt-14 text-[96px] font-semibold leading-[0.98] tracking-tight text-white">Don&apos;t ask me.<br /><span className="text-amber-300">asky.</span></h1>
          <p className="mt-6 font-mono text-[26px] text-stone-400">/ ask · why /</p>
          <p className="mt-10 max-w-[620px] text-[28px] leading-snug text-stone-300">The AI apprentice that learns <i>why</i> your experts do what they do — before they retire.</p>
        </div>
        <HeroPlayer frames={d.frames} />
      </div>
    ),
  },
  {
    id: "problem",
    secs: 25,
    dark: true,
    notes: "This is happening everywhere. 4.1 million Americans turn 65 every year through 2027. In Germany 12.9 million workers — almost a third of the workforce — reach retirement age by 2036. What made them good was never written down. Screen recordings show what they clicked — never why.",
    body: () => (
      <div className="flex h-full flex-col justify-center px-20">
        <Kicker>The problem</Kicker>
        <h2 className="max-w-[1250px] text-[64px] font-semibold leading-[1.05] tracking-tight text-white">The most experienced generation is retiring. What they know was never written down.</h2>
        <div className="mt-16 grid grid-cols-3 gap-8">
          {[
            ["4.1 M", "Americans turn 65 every year through 2027 — 11,200 a day"],
            ["12.9 M", "German workers pass retirement age by 2036 — almost 30% of the workforce"],
            ["why?", "is what no recording captures. Screen recordings and process mining show the clicks, not the judgment."],
          ].map(([n, l]) => (
            <div key={n} className="rounded-3xl bg-white/[0.04] p-8 ring-1 ring-white/10">
              <div className="text-[84px] font-semibold leading-none tracking-tight text-amber-300">{n}</div>
              <p className="mt-5 text-[24px] leading-snug text-stone-300">{l}</p>
            </div>
          ))}
        </div>
        <Source>Sources: Alliance for Lifetime Income, “Peak 65” (2024) · Destatis, Federal Statistical Office of Germany</Source>
      </div>
    ),
  },
  {
    id: "market",
    secs: 20,
    dark: true,
    notes: "Companies already spend 400 billion dollars a year on training. That buys courses — generic content. The judgment that runs the business — why this invoice is capex, why that supplier goes on hold — isn't in any course. We start in the finance back office, inside the ERP, where one wrong click costs real money.",
    body: () => (
      <div className="grid h-full grid-cols-[1.1fr_1fr] items-center gap-16 px-20">
        <div>
          <Kicker>The market</Kicker>
          <div className="text-[200px] font-semibold leading-none tracking-tight text-white">$400B</div>
          <p className="mt-6 text-[34px] leading-snug text-stone-300">spent on corporate training every year —<br /><span className="text-white">and none of it teaches what your retiring expert knows.</span></p>
        </div>
        <ol className="space-y-5">
          {[
            ["Start", "Finance back office in the ERP — accounts payable, procurement. One wrong post costs real money."],
            ["Expand", "Any web app: asky learns it from the screen, no integration needed."],
            ["Agents", "The same knowledge becomes guardrails for AI agents doing the work."],
          ].map(([t, x], i) => (
            <li key={t} className="flex gap-6 rounded-3xl bg-white/[0.04] p-7 ring-1 ring-white/10">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-amber-400 text-[22px] font-semibold text-stone-950">{i + 1}</span>
              <div>
                <div className="text-[28px] font-semibold text-white">{t}</div>
                <p className="mt-1 text-[22px] leading-snug text-stone-400">{x}</p>
              </div>
            </li>
          ))}
        </ol>
        <Source>Source: The Josh Bersin Company, corporate learning market (2026)</Source>
      </div>
    ),
  },
  {
    id: "demo",
    secs: 51,
    dark: true,
    notes: "[Play — the video is narrated, 51 s.] Thomas recodes an invoice → asky asks why at the pause → teach-back → new hire Lena tries the wrong post → “Stop — don't click Yes.” Real ERPNext, from the shared screen only.",
    body: () => <Video src="/pitch-media/demo.mp4" poster="/pitch-media/demo-poster.jpg" />,
  },
  {
    id: "moment",
    secs: 25,
    dark: false,
    notes: "Why this works when other assistants get switched off: asky waits for a real pause. Then Jev, a fast decision model, picks in about 300 milliseconds — ask now, ask before the irreversible step, save it for the debrief, or stay quiet because it already knows. And it does this on the real app, from the screen alone.",
    body: (d) => (
      <div className="flex h-full flex-col justify-center px-20">
        <Kicker dark={false}>Why it works</Kicker>
        <h2 className="mb-10 text-[56px] font-semibold leading-tight tracking-tight text-stone-900">It asks <i>why</i> — at the right moment.</h2>
        {d.decisions.capex && <JevDemo d={d.decisions.capex} fallback={d.decisions.fallback} medianMs={d.decisions.medianMs} count={d.decisions.jevCount} />}
      </div>
    ),
  },
  {
    id: "agents",
    secs: 15,
    dark: false,
    notes: "The same knowledge works for AI agents. asky turns any web app into tools — read, write, irreversible — and its MCP server refuses when an agent would break Sabine's rule.",
    body: (d) => (
      <div className="flex h-full flex-col justify-center px-20">
        <Kicker dark={false}>Beyond people</Kicker>
        <h2 className="mb-10 text-[56px] font-semibold leading-tight tracking-tight text-stone-900">Any app becomes tools. Any agent gets the guardrails.</h2>
        {d.harness && <HarnessDemo h={d.harness} />}
      </div>
    ),
  },
  {
    id: "close",
    secs: 20,
    dark: true,
    notes: "Experts retire. Their “why” doesn't have to. Scan the code: be Sabine for fifteen minutes, then be Lena and see if asky stops you. Don't ask me — asky.",
    body: () => (
      <div className="grid h-full grid-cols-[1.5fr_1fr] items-center gap-12 px-20">
        <div>
          <Logo />
          <h2 className="mt-12 text-[68px] font-semibold leading-[1.02] tracking-tight text-white">Experts retire.<br />Their <span className="text-amber-300">why</span> doesn&apos;t have to.</h2>
          <p className="mt-12 text-[110px] font-semibold leading-none tracking-tight text-white">Don&apos;t ask me. <span className="text-amber-300">asky.</span></p>
        </div>
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pitch-media/qr.svg" alt={`QR code: ${URL_SHORT}`} className="h-[400px] w-[400px] rounded-3xl bg-white p-6" />
          <p className="mt-6 text-[28px] font-semibold text-white">Try it now — no sign-up</p>
          <p className="mt-1 font-mono text-[22px] text-stone-400">{URL_SHORT}</p>
        </div>
      </div>
    ),
  },
  // ── backup for questions ──
  {
    id: "vision",
    secs: 0,
    dark: false,
    backup: true,
    notes: "Backup — no plugin, no integration on ERPNext: vision reads each frame, the app's API confirms what was really saved.",
    body: (d) => (
      <div className="flex h-full flex-col justify-center px-20">
        <Kicker dark={false}>Backup · real apps</Kicker>
        <h2 className="mb-10 text-[48px] font-semibold tracking-tight text-stone-900">Works on the real app — from the screen alone.</h2>
        <VisionDemo frames={d.frames} />
      </div>
    ),
  },
  {
    id: "stop",
    secs: 0,
    dark: false,
    backup: true,
    notes: "Backup — the tutor steps in at the confirm dialog, the last moment that still counts, in the expert's own words.",
    body: (d) => (
      <div className="flex h-full flex-col justify-center px-20">
        <Kicker dark={false}>Backup · teach</Kicker>
        <h2 className="mb-10 text-[48px] font-semibold tracking-tight text-stone-900">Stops the mistake before it&apos;s saved.</h2>
        <StopDemo guardrail={d.page?.guardrails[0]?.text ?? ""} quote={d.page?.why[0]?.quote ?? undefined} expert="Sabine" />
      </div>
    ),
  },
  {
    id: "pages",
    secs: 0,
    dark: false,
    backup: true,
    notes: "Backup — one page per judgment call; every sentence remembers who said it, when, and what was on the screen.",
    body: (d) => (
      <div className="flex h-full flex-col justify-center px-20">
        <Kicker dark={false}>Backup · map</Kicker>
        <h2 className="mb-10 text-[48px] font-semibold tracking-tight text-stone-900">Every rule traceable to the expert&apos;s words.</h2>
        {d.page && <PageDemo p={d.page} />}
      </div>
    ),
  },
  {
    id: "living",
    secs: 0,
    dark: false,
    backup: true,
    notes: "Backup — two experts, eighteen minutes apart, say opposite things. asky keeps the history, switches off the outdated rule, and lets a person decide.",
    body: (d) => (
      <div className="flex h-full flex-col justify-center px-20">
        <Kicker dark={false}>Backup · living knowledge</Kicker>
        <h2 className="mb-10 text-[48px] font-semibold tracking-tight text-stone-900">Knowledge that stays current.</h2>
        {d.schmidt && <SchmidtStory s={d.schmidt} />}
      </div>
    ),
  },
  {
    id: "tech",
    secs: 0,
    dark: true,
    backup: true,
    notes: "Backup — 60 s technical walkthrough: harness, vision, Jev, soft interrupts, process graph, guardrails.",
    body: () => <Video src="/pitch-media/tech.mp4" poster="/pitch-media/tech-poster.jpg" />,
  },
];

const PITCH = SLIDES.filter((s) => !s.backup);
const TOTAL = PITCH.reduce((a, s) => a + s.secs, 0);
const START = SLIDES.map((_, i) => SLIDES.slice(0, i).reduce((a, s) => a + s.secs, 0));
// the slide lives in the URL hash (#3), so a reload or a shared link keeps the place
const onHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const hashSlide = () => {
  const n = Number(location.hash.slice(1));
  return n >= 1 && n <= SLIDES.length ? n - 1 : 0;
};
const onResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const fitScale = () => Math.min(window.innerWidth / W, window.innerHeight / H);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Video({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    // a key press moved us here, so the browser allows sound; if not, start muted
    ref.current?.play().catch(() => {
      if (!ref.current) return;
      ref.current.muted = true;
      void ref.current.play();
    });
  }, []);
  return (
    <div className="flex h-full items-center justify-center bg-black">
      <video ref={ref} src={src} poster={poster} controls playsInline className="h-full w-full object-contain" />
    </div>
  );
}

export default function Deck({ d }: { d: LandingData }) {
  const i = useSyncExternalStore(onHash, hashSlide, () => 0);
  const scale = useSyncExternalStore(onResize, fitScale, () => 1);
  const [notes, setNotes] = useState(false);
  const [t0, setT0] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  const go = useCallback((n: number) => {
    const k = Math.max(0, Math.min(SLIDES.length - 1, n));
    setT0((t) => t ?? (k > 0 ? Date.now() : null)); // the clock starts on the first advance
    history.replaceState(null, "", `#${k + 1}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(i + 1); }
      else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); go(i - 1); }
      else if (e.key === "Home") go(0);
      else if (e.key === "n" || e.key === "N") setNotes((x) => !x);
      else if (e.key === "t" || e.key === "T") setT0(Date.now());
      else if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [i, go]);

  const s = SLIDES[i];
  const elapsed = t0 ? (now - t0) / 1000 : 0;
  const behind = t0 && !s.backup ? elapsed - (START[i] + s.secs) : 0;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div
        className={`absolute left-1/2 top-1/2 overflow-hidden ${s.dark ? "bg-stone-950" : "bg-stone-100"}`}
        style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {s.dark && s.id !== "demo" && s.id !== "tech" && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.14),transparent_55%)]" />}
        <div key={s.id} className="relative h-full animate-[pitchIn_450ms_ease-out]">{s.body(d)}</div>
        {/* progress through the 3 minutes */}
        {!s.backup && (
          <div className="absolute inset-x-0 bottom-0 flex h-1.5 gap-1">
            {PITCH.map((p, k) => <div key={p.id} style={{ flex: p.secs }} className={k <= i ? "bg-amber-400" : s.dark ? "bg-white/10" : "bg-stone-300"} />)}
          </div>
        )}
        {s.backup && <div className="absolute right-8 top-6 rounded-full bg-stone-900/80 px-3 py-1 text-[13px] font-medium text-stone-300">backup · {i + 1 - PITCH.length}/{SLIDES.length - PITCH.length}</div>}
      </div>

      {notes && (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-stone-950/95 px-6 py-4 text-stone-200 ring-1 ring-white/10">
          <div className="mb-1 flex items-center gap-4 font-mono text-[13px] text-stone-400">
            <span>{i + 1}/{SLIDES.length} · {s.id}</span>
            {!s.backup && <span>slot {mmss(START[i])}–{mmss(START[i] + s.secs)} ({s.secs}s)</span>}
            <span className={behind > 0 ? "text-rose-400" : "text-emerald-400"}>⏱ {mmss(elapsed)} / {mmss(TOTAL)}{behind > 0 ? ` · ${Math.round(behind)}s over` : ""}</span>
            <span className="ml-auto">← → slides · F fullscreen · T restart clock · N hide</span>
          </div>
          <p className="max-w-5xl text-[17px] leading-relaxed">{s.notes}</p>
        </div>
      )}
      {!notes && (
        <div className="absolute bottom-3 right-3 z-10 flex gap-1 opacity-0 transition-opacity hover:opacity-100">
          <button onClick={() => go(i - 1)} className="rounded bg-white/10 px-3 py-1 text-sm text-white">←</button>
          <button onClick={() => setNotes(true)} className="rounded bg-white/10 px-3 py-1 text-sm text-white">notes</button>
          <button onClick={() => go(i + 1)} className="rounded bg-white/10 px-3 py-1 text-sm text-white">→</button>
        </div>
      )}
      <style>{`@keyframes pitchIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
