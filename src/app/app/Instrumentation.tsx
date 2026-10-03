"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { emit } from "@/lib/ap/bridge";

/** Reports focus / typing / clicks / navigation to the apprentice shell. */
export default function Instrumentation() {
  const pathname = usePathname();

  useEffect(() => {
    emit({ type: "asky:ui", action: "nav", path: pathname, ts: Date.now() });
  }, [pathname]);

  useEffect(() => {
    const fieldOf = (el: Element | null) =>
      (el as HTMLElement | null)?.closest("[data-field]")?.getAttribute("data-field") ||
      (el as HTMLInputElement | null)?.name ||
      undefined;

    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (!t.matches("input, select, textarea")) return;
      emit({ type: "asky:ui", action: "focus", field: fieldOf(t), ts: Date.now() });
    };
    let last = 0;
    const onInput = (e: Event) => {
      const now = Date.now();
      if (now - last < 250) return; // typing heartbeat, not every keystroke
      last = now;
      const t = e.target as HTMLInputElement;
      const pii = !!t.closest("[data-pii]");
      emit({ type: "asky:ui", action: "input", field: fieldOf(t), value: pii ? undefined : t.value?.slice(0, 40), ts: now });
    };
    const onClick = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest("button, a, [role=tab]");
      if (!b) return;
      emit({ type: "asky:ui", action: "click", label: (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 60), ts: Date.now() });
    };
    const onKey = () => {
      const now = Date.now();
      if (now - last < 250) return;
      last = now;
      emit({ type: "asky:ui", action: "input", ts: now });
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("input", onInput, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);

  return null;
}
