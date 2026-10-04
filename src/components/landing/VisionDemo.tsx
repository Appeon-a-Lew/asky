"use client";

import { useInView, useTimeline } from "./shared";
import type { Frame } from "./types";

// Each frame → a structured reading (asky's own vision output, verbatim) →
// a domain step. Saved changes only count once ERPNext's API confirms them.
const STEPS: { file: string; step: string; api?: string }[] = [
  { file: "05-open-4471.jpg", step: "get_invoice · opened 4471" },
  { file: "06-4471-recoded-not-saved.jpg", step: "editing — not saved, nothing counts yet" },
  { file: "07-4471-saved.jpg", step: "set_invoice_coding · 4711 → 0400", api: "ERPNext API: cost_center = 0400 ✓" },
  { file: "08-post-4471-confirm-dialog.jpg", step: "post_invoice ahead — irreversible: open questions first" },
  { file: "09-4471-posted.jpg", step: "post_invoice", api: "ERPNext API: workflow_state = Posted ✓" },
];

export default function VisionDemo({ frames }: { frames: Frame[] }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const { t, set } = useTimeline(STEPS.length, 2400, seen, true);
  const cur = STEPS[t];
  const reading = frames.find((f) => f.file === cur.file)?.screen as Record<string, string | boolean | undefined> | undefined;
  const fields = reading ? (["view", "invoiceRef", "costCenter", "status", "dialog"] as const).filter((k) => reading[k] !== undefined && reading[k] !== "") : [];
  return (
    <div ref={ref} className="grid gap-4 lg:grid-cols-5">
      <div className="overflow-hidden rounded-2xl ring-1 ring-stone-200 lg:col-span-3">
        <div className="relative aspect-[16/10] bg-stone-900">
          {STEPS.map((s, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={s.file} src={`/landing/erpnext/${s.file}`} alt={s.step} className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500 ${i === t ? "opacity-100" : "opacity-0"}`} />
          ))}
        </div>
        <div className="flex gap-1 bg-stone-100 p-2">
          {STEPS.map((s, i) => <button key={s.file} onClick={() => set(i)} aria-label={s.step} className={`h-1.5 flex-1 rounded-full ${i === t ? "bg-stone-900" : "bg-stone-300 hover:bg-stone-400"}`} />)}
        </div>
      </div>
      <div className="space-y-3 lg:col-span-2">
        <div className="rounded-2xl bg-stone-900 p-4 font-mono text-[12px] leading-relaxed text-stone-300 ring-1 ring-white/10">
          <div className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-wider text-amber-300">what asky read off the screen</div>
          {"{"}
          {fields.map((k) => (
            <div key={k} className="pl-4"><span className="text-sky-300">{k}</span>: <span className="text-emerald-200">&quot;{String(reading![k])}&quot;</span>,</div>
          ))}
          {"}"}
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">becomes a step</div>
          <div className="mt-1 font-mono text-[13px] text-stone-900">{cur.step}</div>
          {cur.api && <div className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 font-mono text-[12px] text-emerald-800 ring-1 ring-emerald-200">{cur.api}</div>}
        </div>
        <p className="text-sm text-stone-600">No plugin, no ERPNext integration code: asky only sees the shared screen. Its API is used read-only, to confirm what was really saved — a misread pixel never becomes knowledge. After each save asky compares the whole document, so taxes, projects and line items are caught too.</p>
      </div>
    </div>
  );
}
