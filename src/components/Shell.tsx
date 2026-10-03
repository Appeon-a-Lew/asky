"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/capture", label: "Capture" },
  { href: "/interview", label: "Interview" },
  { href: "/hub", label: "Knowledge Hub" },
  { href: "/teach", label: "Teach" },
];

export function EngineBadges() {
  const [cfg, setCfg] = useState<{ elevenlabs: boolean; llm: boolean; jev: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/voice/config").then((r) => r.json()).then(setCfg).catch(() => {});
  }, []);
  if (!cfg) return null;
  const b = (on: boolean, a: string, off: string) => (
    <span className={`rounded-full px-2 py-0.5 text-[11px] ${on ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>{on ? a : off}</span>
  );
  return (
    <div className="flex gap-1.5">
      {b(cfg.elevenlabs, "voice: ElevenLabs", "voice: browser")}
      {b(cfg.jev, "decide: Jev", "decide: rules")}
      {b(cfg.llm, "LLM: Claude", "LLM: offline")}
    </div>
  );
}

export default function Shell({ children, right, full }: { children: React.ReactNode; right?: React.ReactNode; full?: boolean }) {
  const path = usePathname();
  return (
    <div className={`flex flex-col ${full ? "h-screen" : "min-h-screen"}`}>
      <header className="flex items-center gap-6 border-b border-stone-200 bg-white/80 px-5 py-2.5 backdrop-blur">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-stone-900 text-sm text-amber-300">a</span>
          asky
          <span className="text-xs font-normal text-stone-500">the AI apprentice</span>
        </Link>
        <nav className="flex gap-1 text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`rounded-md px-3 py-1.5 ${path.startsWith(n.href) ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {right}
          <EngineBadges />
        </div>
      </header>
      <div className={full ? "min-h-0 flex-1" : "flex-1"}>{children}</div>
    </div>
  );
}
