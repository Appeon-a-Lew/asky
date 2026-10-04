"use client";

import { fmtTime, useInView, useTimeline } from "./shared";
import type { LandingData } from "./types";

type S = NonNullable<LandingData["schmidt"]>;

// Two experts, eighteen minutes apart, say opposite things. A wiki that only
// appends would now contradict itself — and keep enforcing the old rule.
export default function SchmidtStory({ s }: { s: S }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.25);
  const { t, set } = useTimeline(5, 4200, seen);
  const entry = s.blacklist.find((b) => /schmidt/i.test(b.supplier));
  const steps = [
    { at: s.sabine?.at, title: "Sabine holds invoice 4470", text: `Not in the 2019 process — Jev: ask now, ${Math.round(((s.holdDecision?.probabilities as Record<string, number> | undefined)?.ask_now ?? 0) * 100)}% in ${s.holdDecision?.latencyMs} ms. asky asks why. “${s.sabine?.text}”` },
    { at: s.thomas?.at, title: "Thomas posts a Schmidt invoice", text: `asky: the page says Schmidt is blacklisted — is this an exception? “${s.thomas?.text}”` },
    { title: "asky sees the knowledge changed", text: "Not a disagreement — the world changed. The newer statement wins; the older items move to “superseded” (kept, attributed, restorable) and the rules built on the old fact switch off." },
    { title: "…and heard a list change", text: "“We took Schmidt Logistic out of blacklist” becomes a suggestion for the supplier blacklist — dated, with the quote. Nothing changes until a person applies it." },
    { title: "A person decides", text: "The page keeps the lasting rule — blacklisted suppliers go on hold — and checks a dated list instead of naming a supplier. The next change needs no page edit at all." },
  ];
  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-2">
      <ol className="space-y-2">
        {steps.map((st, i) => (
          <li key={i}>
            <button onClick={() => set(i)} className={`w-full rounded-2xl p-4 text-left transition-all ${i === t ? "bg-white shadow-sm ring-1 ring-stone-300" : "opacity-60 hover:opacity-100"}`}>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${i <= t ? "bg-stone-900 text-white" : "bg-stone-200"}`}>{i + 1}</span>
                {st.at ? fmtTime(st.at) : ""}
                {i === 1 && s.sabine?.at && s.thomas?.at ? <span className="normal-case tracking-normal text-amber-700">· {Math.round((s.thomas.at - s.sabine.at) / 60000)} min later</span> : null}
              </div>
              <div className="mt-1 font-semibold text-stone-900">{st.title}</div>
              {i === t && <p className="mt-1 text-sm text-stone-600">{st.text}</p>}
            </button>
          </li>
        ))}
      </ol>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <div className="mb-1 text-[11px] text-stone-500">Knowledge hub · page</div>
          <h4 className="text-lg font-semibold leading-snug text-stone-900">{t < 4 ? "Invoices from blacklisted suppliers (currently Schmidt Logistik KG) go on hold automatically" : s.page.title}</h4>

          {t >= 2 && t < 4 && s.conflict && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-950">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide">Knowledge changed — please confirm</div>
              {s.conflict.summary}
            </div>
          )}

          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Rules</div>
          <ul className="mt-1 space-y-1.5 text-sm">
            <li className={t >= 2 ? "text-stone-400 line-through" : "text-stone-900"}>
              <span className="mr-1.5 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white no-underline">NEVER</span>
              post or pay an invoice from Schmidt Logistik KG
              <div className="font-mono text-[11px]">before post_invoice when supplier.name contains “Schmidt Logistik”</div>
            </li>
            {t >= 4 && s.rules.map((r, i) => (
              <li key={i} className="text-stone-900">
                <span className="mr-1.5 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">NEVER</span>
                {r.text}
                <div className="font-mono text-[11px] text-stone-500">before {r.rule?.onTool} when supplier.blacklisted = true</div>
              </li>
            ))}
          </ul>

          {t >= 2 && (
            <>
              <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Superseded · {s.superseded.length} items</div>
              <ul className="mt-1 space-y-1 text-[13px] text-stone-400">{s.superseded.slice(0, 3).map((x, i) => <li key={i} className="line-through">{x.text}</li>)}</ul>
            </>
          )}

          {t >= 3 && entry && (
            <div className="mt-3 rounded-xl bg-stone-50 p-3 text-[13px] ring-1 ring-stone-200">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Supplier blacklist</div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-stone-900">{entry.supplier}</span>
                <span className="font-mono text-[11px] text-stone-500">{fmtTime(entry.addedAt)} {entry.addedBy} → {fmtTime(entry.removedAt ?? undefined)} {entry.removedBy}</span>
              </div>
              <div className="text-stone-500">{t >= 4 ? "taken off the list — applied by a person" : "asky heard: take off the list → Apply / Dismiss"}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
