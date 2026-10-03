"use client";

import Link from "next/link";
import { useState } from "react";
import { speak } from "@/components/hub";
import type { WorkMapStep } from "@/lib/types";

type Step = WorkMapStep & { when: string; reasonWhen?: string; frame?: string };

/** Clickable timeline: every step → screen moment, decision, reason in the expert's words, guardrails. */
export default function WorkMapView({ steps, expert, pages }: { steps: Step[]; expert: string; pages: Record<string, string> }) {
  const [sel, setSel] = useState(0);
  const s = steps[sel];
  if (!steps.length) return <div className="text-sm text-stone-400">No steps.</div>;
  return (
    <div className="grid grid-cols-5 gap-4">
      <ol className="col-span-2 max-h-[70vh] space-y-1 overflow-y-auto pr-1">
        {steps.map((st, k) => (
          <li key={st.id}>
            <button onClick={() => setSel(k)} className={`flex w-full items-start gap-3 rounded-lg border p-2.5 text-left text-sm ${k === sel ? "border-amber-400 bg-amber-50" : "border-transparent hover:bg-white"}`}>
              <span className="mt-0.5 font-mono text-[11px] text-stone-400">{st.when}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-snug">{st.title}</span>
                <span className="mt-0.5 flex gap-1.5 text-[10px]">
                  {st.reason && <span className="rounded bg-emerald-100 px-1 text-emerald-800">reason</span>}
                  {st.guardrails.length > 0 && <span className="rounded bg-rose-100 px-1 text-rose-800">{st.guardrails.length} guardrail{st.guardrails.length > 1 ? "s" : ""}</span>}
                  {st.caseId && <span className="text-stone-400">inv {st.caseId}</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="col-span-3 space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">Step {s.index} of {steps.length}</div>
        <h2 className="text-lg font-semibold">{s.title}</h2>
        <dl className="grid grid-cols-[110px_1fr] gap-y-3 text-sm">
          <dt className="text-stone-500">Screen moment</dt>
          <dd>
            <span className="font-mono">{s.when}</span>{s.caseId && <>, invoice {s.caseId}</>}
            {s.frame ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.frame} alt="screen moment" className="mt-2 rounded-lg border border-stone-200" />
            ) : <div className="mt-1 text-xs text-stone-400">no screen share in this session</div>}
          </dd>
          <dt className="text-stone-500">Decision</dt>
          <dd>{s.decision}</dd>
          <dt className="text-stone-500">Reason</dt>
          <dd>
            {s.reason ? (
              <>
                <blockquote className="border-l-2 border-amber-400 pl-3 italic">“{s.reason.quote ?? s.reason.text}”</blockquote>
                <div className="mt-1 flex gap-3 text-xs text-stone-500">
                  <span>{expert}, {s.reasonWhen ? `answer at ${s.reasonWhen}` : "debrief"}</span>
                  <button onClick={() => speak(s.reason!.quote ?? s.reason!.text)} className="text-sky-700 underline">▶ listen</button>
                  {s.reason.utteranceId && <a href={`#${s.reason.utteranceId}`} className="text-sky-700 underline">transcript</a>}
                </div>
              </>
            ) : <span className="text-stone-400">routine step — no question needed</span>}
          </dd>
          <dt className="text-stone-500">Guardrails</dt>
          <dd>
            {s.guardrails.length ? (
              <ul className="space-y-1">{s.guardrails.map((g, k) => <li key={k} className="rounded bg-rose-50 px-2 py-1 text-rose-900">{g.text}{g.quote && g.quote !== g.text ? <span className="block text-xs italic text-rose-700">“{g.quote}”</span> : null}</li>)}</ul>
            ) : <span className="text-stone-400">—</span>}
          </dd>
          {(s.pageId || s.nodeId) && (
            <>
              <dt className="text-stone-500">Knowledge</dt>
              <dd className="flex gap-3">
                {s.pageId && <Link href={`/hub/pages/${s.pageId}`} className="text-sky-700 underline">⚑ {pages[s.pageId]}</Link>}
                {s.nodeId && <Link href={`/hub/graph?focus=${s.nodeId}`} className="text-sky-700 underline">graph node</Link>}
              </dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
