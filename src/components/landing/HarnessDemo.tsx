"use client";

import { Effect, useInView, useTimeline } from "./shared";
import type { LandingData } from "./types";

type H = NonNullable<LandingData["harness"]>;

// asky's own vocabulary (left) found in ERPNext's generated tools (right).
export default function HarnessDemo({ h }: { h: H }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const { t, set } = useTimeline(h.alignment.length, 1600, seen, true);
  const cur = h.alignment[t];
  const used = [...new Set(h.alignment.flatMap((a) => a.tools))];
  const effect = (n: string) => h.tools.find((x) => x.name === n)?.effect ?? "write";
  const title = (n: string) => h.tools.find((x) => x.name === n)?.title ?? "";
  return (
    <div ref={ref} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          [h.counts.tools, "tools generated for ERPNext"],
          [`${h.alignment.filter((a) => a.tools.length).length}/${h.alignment.length}`, "of asky's steps found in them"],
          [h.counts.irreversible, "irreversible — asky asks before these"],
          [0, "changes made while discovering"],
        ].map(([n, l]) => (
          <div key={String(l)} className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <div className="text-[28px] font-semibold leading-none tracking-tight text-stone-900">{n}</div>
            <div className="mt-1.5 text-sm text-stone-600">{l}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 rounded-2xl bg-stone-900 p-4 text-stone-200 ring-1 ring-white/10 md:grid-cols-2 md:p-5">
        <div className="min-w-0">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">asky&apos;s steps (the knowledge hub&apos;s vocabulary)</div>
          <ul className="space-y-1">
            {h.alignment.map((a, i) => (
              <li key={a.canonical}>
                <button onClick={() => set(i)} className={`w-full truncate rounded-lg px-2.5 py-1.5 text-left font-mono text-[12px] transition-colors ${i === t ? "bg-amber-400/15 text-amber-100 ring-1 ring-amber-300/30" : "text-stone-400 hover:bg-white/5"}`}>
                  {a.canonical} {a.tools.length ? <span className="text-emerald-400">✓</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">ERPNext tools (generated)</div>
          <ul className="space-y-1">
            {used.map((n) => {
              const on = cur.tools.includes(n);
              return (
                <li key={n} className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 transition-all ${on ? "bg-white/10 ring-1 ring-white/20" : "opacity-40"}`}>
                  <span className="min-w-0"><span className="block truncate font-mono text-[12px] text-stone-100">{n}</span>{on && <span className="block truncate text-[11px] text-stone-400">{title(n)}</span>}</span>
                  <Effect effect={effect(n)} />
                </li>
              );
            })}
          </ul>
          {cur.note && <p className="mt-3 rounded-lg bg-white/5 p-2.5 text-[12px] text-stone-300"><span className="font-semibold text-amber-300">{cur.canonical}:</span> {cur.note}</p>}
        </div>
      </div>
      <p className="text-sm text-stone-600">ERPNext has no OpenAPI file — but it describes itself. The harness reads its form definitions (sections become tools, posting is “irreversible”, the approval workflow becomes one tool per transition) and logs in to click through a real invoice with every change intercepted, never executed. The same tools are the vocabulary of asky&apos;s events and guardrails, and an MCP server other agents can use — whose write tools refuse when a guardrail would be broken.</p>
    </div>
  );
}
