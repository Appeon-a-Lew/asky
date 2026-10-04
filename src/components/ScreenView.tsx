"use client";

import type { FrameResult } from "./useScreenShare";

/** Real app: what asky sees is the shared screen itself, plus what the vision model read off it. */
export default function ScreenView({ frame, sharing, screen, url, onShare }: { frame: string | null; sharing: boolean; screen: FrameResult["screen"]; url: string; onShare: () => void }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-stone-950">
      {frame ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frame} alt="shared screen" className="min-h-0 flex-1 object-contain" />
      ) : (
        <div className="grid flex-1 place-items-center p-8 text-center text-sm text-stone-300">
          <div className="max-w-sm space-y-3">
            <div className="text-base font-semibold text-white">{sharing ? "Waiting for the first frame…" : "Share your ERPNext tab"}</div>
            <p>Open <a href={`${url}/app/purchase-invoice`} target="_blank" rel="noreferrer" className="text-amber-300 underline">ERPNext</a> in another tab, then share that tab. asky only sees the screen — no plugin, no access to the browser.</p>
            {!sharing && <button onClick={onShare} className="rounded-lg bg-amber-400 px-4 py-2 font-medium text-stone-950">● Share screen</button>}
          </div>
        </div>
      )}
      {screen && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-stone-950/85 p-3 text-xs text-stone-200 shadow-lg ring-1 ring-white/10 backdrop-blur">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="font-medium uppercase tracking-wider text-amber-300">asky sees</span>
            {[screen.view.replace("_", " "), screen.invoiceRef && `invoice ${screen.invoiceRef}`, screen.section, screen.costCenter && `cost center ${screen.costCenter}`, screen.status].filter(Boolean).map((x) => <span key={String(x)} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">{x}</span>)}
          </div>
          <div className="text-stone-300">{screen.dialog ? `Dialog: “${screen.dialog}”` : screen.activity ?? screen.caption}</div>
        </div>
      )}
    </div>
  );
}
