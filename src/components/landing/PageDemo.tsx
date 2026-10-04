"use client";

import { useState } from "react";
import type { LandingData } from "./types";

type P = NonNullable<LandingData["page"]>;

const KIND: Record<string, string> = { never: "NEVER", stop_and_ask: "STOP & ASK", limit: "LIMIT", require: "REQUIRED" };

// A knowledge page as the hub shows it: one judgment call, every sentence traceable.
export default function PageDemo({ p }: { p: P }) {
  const [open, setOpen] = useState<number | null>(0);
  const when = (ts?: number | null) => (ts ? new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) : "");
  const cond = (c: { field: string; op: string; value?: unknown }) => `${c.field} ${({ gt: ">", eq: "=", lt: "<", gte: "≥", lte: "≤", neq: "≠" } as Record<string, string>)[c.op] ?? c.op} ${c.value ?? ""}`;
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <article className="rounded-2xl bg-white p-5 ring-1 ring-stone-200 lg:col-span-3">
        <div className="mb-1 flex items-center gap-2 text-[11px] text-stone-500"><span className="rounded-full bg-emerald-600 px-2 py-0.5 font-medium text-white">confirmed</span>by the expert in the teach-back</div>
        <h3 className="text-xl font-semibold tracking-tight text-stone-900">{p.title}</h3>
        <p className="mt-1 text-sm text-stone-600">{p.triggerText}</p>
        <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-stone-500">What to do</div>
        <ol className="mt-1 space-y-1 text-sm text-stone-800">{p.steps.map((s, i) => <li key={i} className="flex gap-2"><span className="text-stone-400">{i + 1}.</span>{s}</li>)}</ol>
        <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Why — in her words</div>
        <ul className="mt-1 space-y-1.5">
          {p.why.map((w, i) => (
            <li key={i}>
              <button onClick={() => setOpen(open === i ? null : i)} className={`w-full rounded-lg px-2 py-1 text-left text-sm italic transition-colors ${open === i ? "bg-amber-50 ring-1 ring-amber-200" : "hover:bg-stone-50"}`}>“{w.quote ?? w.text}”</button>
              {open === i && <div className="mt-1 px-2 text-[12px] text-stone-500">said by <b className="text-stone-700">{w.by}</b> · {when(w.at)} · in a capture session, answering asky&apos;s question · confirmed in the teach-back</div>}
            </li>
          ))}
        </ul>
        <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Guardrails — executable</div>
        <ul className="mt-1 space-y-2">
          {p.guardrails.map((g, i) => (
            <li key={i} className="text-sm">
              <span className="mr-2 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{KIND[g.kind] ?? g.kind}</span>
              <span className="font-medium text-stone-900">{g.text}</span>
              {g.rule && (
                <div className="mt-1 font-mono text-[11px] text-stone-500">
                  before <b>{g.rule.onTool}</b> when {g.rule.when.map(cond).join(" ∧ ")}
                  {"require" in g.rule && g.rule.require ? <> → require {(g.rule.require as { field: string; op: string; value?: unknown }[]).map(cond).join(" ∧ ")}</> : null}
                </div>
              )}
            </li>
          ))}
        </ul>
        {p.mistakes.length > 0 && <div className="mt-4 rounded-lg bg-rose-50 p-2.5 text-[13px] text-rose-900 ring-1 ring-rose-200">New hires got this wrong: {p.mistakes.map((m) => `${m.count}× ${m.text}`).join(" · ")}</div>}
      </article>
      <div className="space-y-3 lg:col-span-2">
        {p.moment && (
          <figure className="overflow-hidden rounded-2xl ring-1 ring-stone-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/landing/${p.moment}`} alt="the screen moment" className="w-full" />
            <figcaption className="bg-white p-3 text-[12px] text-stone-600">The screen moment the quote belongs to — captured when she answered.</figcaption>
          </figure>
        )}
        <p className="text-sm text-stone-600">One page per <b>judgment</b>, not per process: when it applies (a machine-checkable trigger), what to do, why, guardrails that run as code, edge cases, the mistakes new hires make. Every sentence keeps who said it, when, the screen moment, and — for recorded interviews — ▶ the original audio. <i>git blame for knowledge.</i></p>
      </div>
    </div>
  );
}
