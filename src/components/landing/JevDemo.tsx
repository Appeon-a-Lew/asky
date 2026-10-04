"use client";

import { useInView, useTimeline } from "./shared";
import type { LandingData } from "./types";

type D = NonNullable<LandingData["decisions"]["capex"]>;
const ACTIONS: { key: string; label: string }[] = [
  { key: "ask_before_commit", label: "ask before the commit" },
  { key: "ask_now", label: "ask now" },
  { key: "queue_debrief", label: "save for the debrief" },
  { key: "ignore", label: "ignore" },
];

// 0 typing · 1 saved → event · 2 pause fills · 3 Jev decides · 4 question · 5 answer
export default function JevDemo({ d, fallback, medianMs, count }: { d: D; fallback?: LandingData["decisions"]["fallback"]; medianMs: number; count: number }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const { t, restart } = useTimeline(6, 1500, seen);
  const p = d.probabilities as Record<string, number>;
  return (
    <div ref={ref} className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-3 rounded-2xl bg-stone-900 p-5 text-stone-200 ring-1 ring-white/10 lg:col-span-3">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-stone-500">
          <span>Capture · {d.expert} · invoice 4471</span>
          <button onClick={restart} className="normal-case tracking-normal text-amber-300 hover:underline">↺ replay</button>
        </div>
        {/* the expert works */}
        <Lane label="typing" active={t === 0} done={t > 0} text={t === 0 ? "cost center: 4711 → 0400 ▍" : "0400 saved"} />
        <div className={`rounded-lg px-3 py-2 font-mono text-[12px] transition-all duration-500 ${t >= 1 ? "bg-white/5 text-stone-200 opacity-100" : "opacity-0"}`}>
          event · set_invoice_coding · <span className="text-amber-200">{d.deviation}</span>
        </div>
        {/* the pause */}
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-stone-500"><span>nobody typing, nobody talking, asky quiet</span><span>pause ≥ 1.8 s</span></div>
          <div className="h-1.5 overflow-hidden rounded bg-white/10"><div className={`h-full rounded bg-emerald-400 transition-all ease-linear ${t >= 2 ? "w-full duration-[1400ms]" : "w-0 duration-0"}`} /></div>
        </div>
        {/* Jev decides */}
        <div className={`rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10 transition-opacity duration-500 ${t >= 3 ? "opacity-100" : "opacity-30"}`}>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-white">Jev decides <span className="font-normal text-stone-400">· TypeSafe System-One model</span></span>
            <span className="font-mono text-amber-300">{t >= 3 ? `${d.latencyMs} ms` : "…"}</span>
          </div>
          <div className="space-y-1.5">
            {ACTIONS.map((a) => {
              const v = p[a.key] ?? 0;
              const win = a.key === d.action;
              return (
                <div key={a.key} className="grid grid-cols-[9.5rem_1fr_2.5rem] items-center gap-2 text-[12px]">
                  <span className={win ? "font-semibold text-white" : "text-stone-400"}>{a.label}</span>
                  <div className="h-2 overflow-hidden rounded bg-white/10"><div className={`h-full rounded transition-all duration-700 ${win ? "bg-amber-400" : "bg-stone-500"}`} style={{ width: t >= 3 ? `${v * 100}%` : "0%" }} /></div>
                  <span className={`text-right font-mono ${win ? "text-amber-300" : "text-stone-500"}`}>{Math.round(v * 100)}%</span>
                </div>
              );
            })}
          </div>
        </div>
        {/* the conversation */}
        <Bubble who="asky" show={t >= 4}>{d.question}</Bubble>
        <Bubble who={d.expert ?? "expert"} show={t >= 5} right>“{d.answer}”</Bubble>
      </div>

      <div className="space-y-3 lg:col-span-2">
        <Fact n={`${medianMs} ms`} label={`median decision time over ${count} real decisions — fast enough to wait for the pause, not interrupt it`} />
        <Fact n="1.8 s" label="of quiet counts as a pause (1.0 s right after a save — a natural boundary). Typing tells the voice agent not to barge in." />
        {fallback && (
          <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
            <div className="mb-1 font-semibold text-stone-900">When Jev isn&apos;t sure</div>
            <p className="text-stone-600">Confidence {fallback.confidence} — below the 0.45 bar — so the rule scorer decided instead: <i>{(fallback.action ?? "").replace(/_/g, " ")}</i>. Every decision is logged with both answers.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Lane({ label, active, done, text }: { label: string; active: boolean; done: boolean; text: string }) {
  return (
    <div className="flex items-center gap-3 text-[12px]">
      <span className="w-14 text-stone-500">{label}</span>
      <div className={`flex-1 rounded-lg px-3 py-2 font-mono transition-colors ${active ? "bg-sky-400/15 text-sky-100" : done ? "bg-white/5 text-stone-400" : "bg-white/5 text-stone-600"}`}>{text}</div>
    </div>
  );
}

function Bubble({ who, show, right, children }: { who: string; show: boolean; right?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex transition-all duration-500 ${right ? "justify-end" : ""} ${show ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug ${right ? "rounded-br-sm bg-emerald-400/15 text-emerald-50" : "rounded-bl-sm bg-amber-400/15 text-amber-50"}`}>
        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider opacity-70">{who}</div>
        {children}
      </div>
    </div>
  );
}

function Fact({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="text-[28px] font-semibold leading-none tracking-tight text-stone-900">{n}</div>
      <p className="mt-1.5 text-sm text-stone-600">{label}</p>
    </div>
  );
}
