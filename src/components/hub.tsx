"use client";

import Link from "next/link";
import { useState } from "react";
import type { ClaimSource, Page, Provenance } from "@/lib/types";

export const SOURCE_STYLE: Record<ClaimSource, string> = {
  confirmed: "bg-emerald-100 text-emerald-800",
  observed: "bg-sky-100 text-sky-800",
  stated: "bg-violet-100 text-violet-800",
  doc: "bg-stone-200 text-stone-700",
  inferred: "bg-amber-100 text-amber-800",
  expert_edit: "bg-rose-100 text-rose-800",
};

export function SourceBadge({ source }: { source: ClaimSource }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${SOURCE_STYLE[source]}`}>{source.replace("_", " ")}</span>;
}

export function PageStatus({ status }: { status: Page["status"] }) {
  const m = { confirmed: "bg-emerald-600 text-white", draft: "bg-amber-200 text-amber-900", stale: "bg-rose-200 text-rose-900" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${m[status]}`}>{status}</span>;
}

export function speak(text: string) {
  if (typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  speechSynthesis.speak(u);
}

/** "git blame for knowledge": who said it, when, the screen moment, listen. */
export function Blame({ prov, people, frames }: { prov: Provenance[]; people: Record<string, string>; frames: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  if (!prov.length) return null;
  const p = prov[0];
  const more = prov.length - 1;
  return (
    <span className="relative inline-flex items-center gap-1 align-middle">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] text-stone-600 hover:border-stone-400">
        <SourceBadge source={p.source} />
        {p.personId && <span>{people[p.personId]?.split(" ")[0] ?? p.personId}</span>}
        {more > 0 && <span className="text-emerald-700">+{more} corroborating</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-30 w-80 rounded-lg border border-stone-200 bg-white p-3 text-xs shadow-xl">
          {prov.map((x, k) => (
            <div key={k} className="mb-2 border-b border-stone-100 pb-2 last:mb-0 last:border-0 last:pb-0">
              <div className="mb-1 flex items-center gap-1.5">
                <SourceBadge source={x.source} />
                <span className="font-medium">{x.personId ? people[x.personId] ?? x.personId : x.docId ?? "—"}</span>
                {x.ts && <span className="text-stone-400">{new Date(x.ts).toLocaleString()}</span>}
              </div>
              {x.quote && <blockquote className="border-l-2 border-amber-400 pl-2 italic text-stone-700">“{x.quote}”</blockquote>}
              <div className="mt-1.5 flex gap-2">
                {x.quote && <button onClick={() => speak(x.quote!)} className="text-sky-700 underline">▶ listen</button>}
                {x.sessionId && <Link href={`/hub/sessions/${x.sessionId}${x.eventId ? `#${x.eventId}` : ""}`} className="text-sky-700 underline">session</Link>}
              </div>
              {x.frameId && frames[x.frameId] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frames[x.frameId]} alt="screen moment" className="mt-2 rounded border border-stone-200" />
              )}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

export function Card({ title, children, action, tone }: { title?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; tone?: "warn" | "ok" | "info" }) {
  const t = tone === "warn" ? "border-rose-200 bg-rose-50/40" : tone === "ok" ? "border-emerald-200 bg-emerald-50/40" : tone === "info" ? "border-sky-200 bg-sky-50/40" : "border-stone-200 bg-white";
  return (
    <section className={`rounded-xl border p-4 shadow-sm ${t}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
