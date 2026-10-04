"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "./shared";
import type { Frame } from "./types";

// The hero: real ERPNext frames from our end-to-end run, with what asky read
// off each one (its own vision output, not a caption we wrote).
const STORY: { file: string; step: string }[] = [
  { file: "05-open-4471.jpg", step: "opened invoice 4471 — CNC spindle unit, €7,850" },
  { file: "06-4471-recoded-not-saved.jpg", step: "cost center 4711 → 0400 (not saved yet)" },
  { file: "07-4471-saved.jpg", step: "saved — confirmed through ERPNext's API" },
  { file: "08-post-4471-confirm-dialog.jpg", step: "irreversible step ahead → asky asks first" },
  { file: "22-Lena-opens-5101.jpg", step: "new hire opens 5101 — “what would Sabine do?”" },
  { file: "23-Lena-posts-5101-on-opex-confirm-dialog.jpg", step: "posting €6,400 on opex → tutor: “Stop — don’t click Yes.”" },
];

export default function HeroPlayer({ frames }: { frames: Frame[] }) {
  const reduced = useReducedMotion();
  const [k, setK] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setK((x) => (x + 1) % STORY.length), 2600);
    return () => clearInterval(id);
  }, [reduced]);
  const cur = STORY[k];
  const sees = frames.find((f) => f.file === cur.file)?.screen;
  const chips = sees ? [sees.view?.replace("_", " "), sees.invoiceRef && `invoice ${sees.invoiceRef}`, sees.costCenter && `cost center ${sees.costCenter}`, sees.status].filter(Boolean) : [];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-stone-900 shadow-2xl shadow-black/40 ring-1 ring-white/10">
      <div className="flex items-center gap-1.5 border-b border-white/5 bg-stone-900 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        <span className="ml-3 truncate font-mono text-[11px] text-stone-500">erp.…/app/purchase-invoice · shared screen</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-rose-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />asky watching</span>
      </div>
      <div className="relative aspect-[16/10] bg-stone-950">
        {STORY.map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={s.file} src={`/landing/erpnext/${s.file}`} alt={s.step} className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-700 ${i === k ? "opacity-100" : "opacity-0"}`} />
        ))}
        <div className="absolute inset-x-3 bottom-3 rounded-xl bg-stone-950/90 p-3 text-xs text-stone-200 shadow-lg ring-1 ring-white/10 backdrop-blur sm:inset-x-4 sm:bottom-4">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="font-semibold uppercase tracking-wider text-amber-300">asky sees</span>
            {chips.map((c) => <span key={String(c)} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">{c}</span>)}
            {sees?.dialog && <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-mono text-[11px] text-rose-200">dialog: “{sees.dialog}”</span>}
          </div>
          <div className="text-stone-300">→ {cur.step}</div>
        </div>
      </div>
      <div className="flex gap-1 bg-stone-900 px-3 py-2">
        {STORY.map((s, i) => <button key={s.file} aria-label={s.step} onClick={() => setK(i)} className={`h-1 flex-1 rounded-full transition-colors ${i === k ? "bg-amber-400" : "bg-white/10 hover:bg-white/25"}`} />)}
      </div>
    </div>
  );
}
