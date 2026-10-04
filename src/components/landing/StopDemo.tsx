"use client";

import { useInView, useTimeline } from "./shared";

// The new hire is one click from posting a €6,400 tool set to an opex cost
// center. ERPNext asks "Are you sure you want to Post?" — asky answers first.
export default function StopDemo({ guardrail, quote, expert }: { guardrail: string; quote?: string; expert?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const { t, restart } = useTimeline(4, 1300, seen);
  return (
    <div ref={ref} className="grid items-center gap-6 lg:grid-cols-5">
      <div className={`relative overflow-hidden rounded-2xl ring-1 transition-shadow duration-500 lg:col-span-3 ${t >= 2 ? "shadow-[0_0_0_4px_rgba(244,63,94,0.55)] ring-rose-400" : "ring-stone-200"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/erpnext/23-Lena-posts-5101-on-opex-confirm-dialog.jpg" alt="ERPNext asks: Are you sure you want to Post?" className="w-full" />
        <div className={`m-3 rounded-xl bg-stone-950/95 p-4 text-sm text-stone-100 shadow-xl ring-1 ring-rose-400/40 transition-all duration-500 sm:absolute sm:inset-x-6 sm:bottom-6 sm:m-0 ${t >= 2 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}>
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-rose-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />tutor · before anything is saved</div>
          <p className="font-medium">Stop — don&apos;t click Yes. {guardrail}</p>
          {quote && t >= 3 && <p className="mt-1.5 text-stone-300">{expert ?? "The expert"} told me: <i>“{quote}”</i></p>}
        </div>
      </div>
      <div className="space-y-4 lg:col-span-2">
        <ol className="space-y-3 text-sm">
          {[
            "Lena, new in accounts payable, opens invoice 5101: a €6,400 press tool set, pre-coded to maintenance (opex).",
            "She clicks Post. ERPNext asks “Are you sure you want to Post?” — the last moment before the ledger.",
            "asky sees the dialog on the shared screen and checks the guardrails it learned from Sabine.",
            "The tutor stops her — with Sabine’s own words — and nothing is saved.",
          ].map((s, i) => (
            <li key={i} className={`flex gap-3 transition-opacity duration-500 ${t >= i ? "opacity-100" : "opacity-35"}`}>
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${t >= i ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-500"}`}>{i + 1}</span>
              <span className="text-stone-700">{s}</span>
            </li>
          ))}
        </ol>
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">In <b>Capture</b> the same moment works the other way round: before the expert confirms an irreversible step, asky asks its open question first — and when a known rule is about to be broken, “is this an exception?”</p>
        <button onClick={restart} className="text-sm text-stone-500 hover:text-stone-900">↺ replay</button>
      </div>
    </div>
  );
}
