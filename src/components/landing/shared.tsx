"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Becomes true once the element scrolls into view (animations start there, not on load). */
export function useInView<T extends Element>(threshold = 0.35) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen] as const;
}

const MOTION = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (cb: () => void) => {
  const m = window.matchMedia(MOTION);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

export function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, () => window.matchMedia(MOTION).matches, () => false);
}

/** A clock that advances `step` every `ms` while visible; `restart()` replays. Reduced motion → stays at the last step. */
export function useTimeline(steps: number, ms: number, visible: boolean, loop = false) {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (!visible || reduced) return;
    const id = setInterval(() => setT((x) => (x + 1 < steps ? x + 1 : loop ? 0 : x)), ms);
    return () => clearInterval(id);
  }, [visible, steps, ms, loop, run, reduced]);
  return {
    // reduced motion: everything at its final state, no animation
    t: reduced ? steps - 1 : t,
    restart: () => {
      setT(0);
      setRun((r) => r + 1);
    },
    set: setT,
  };
}

export const Mono = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <span className={`font-mono text-[12px] ${className}`}>{children}</span>;

export function Effect({ effect }: { effect: string }) {
  const c = effect === "irreversible" ? "bg-rose-500/15 text-rose-300 ring-rose-400/30" : effect === "write" ? "bg-amber-400/15 text-amber-200 ring-amber-300/30" : "bg-sky-400/15 text-sky-200 ring-sky-300/30";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${c}`}>{effect}</span>;
}

export const fmtTime = (ts?: number) => (ts ? new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Berlin" }) : "");
