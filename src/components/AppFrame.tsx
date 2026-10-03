"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type BridgeMsg =
  | { type: "asky:api"; method: string; path: string; body?: unknown; status: number; ok: boolean; response?: Record<string, unknown>; ts: number }
  | { type: "asky:ui"; action: "focus" | "input" | "click" | "nav"; field?: string; value?: string; label?: string; path?: string; ts: number };

export type GateMsg = { type: "asky:gate"; id: string; method: string; path: string; body?: unknown; ts: number };

export interface AppFrameHandle {
  setPrivacy(blur: boolean): void;
  highlight(selector: string | null): void;
  reload(): void;
}

/** Embeds the instrumented app and speaks its postMessage protocol. */
const AppFrame = forwardRef<AppFrameHandle, {
  src: string;
  onBridge: (m: BridgeMsg) => void;
  onGate: (m: GateMsg) => Promise<{ allow: boolean; message?: string }>;
  privacyBlur?: boolean;
}>(function AppFrame({ src, onBridge, onGate, privacyBlur }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  const handlers = useRef({ onBridge, onGate });
  handlers.current = { onBridge, onGate };

  const post = (msg: unknown) => frame.current?.contentWindow?.postMessage(msg, window.location.origin);

  useImperativeHandle(ref, () => ({
    setPrivacy: (blur) => post({ type: "asky:privacy", blur }),
    highlight: (selector) => post({ type: "asky:highlight", selector }),
    reload: () => frame.current?.contentWindow?.location.reload(),
  }));

  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const m = e.data as BridgeMsg | GateMsg;
      if (!m || typeof m !== "object" || !("type" in m)) return;
      if (m.type === "asky:gate") {
        post({ type: "asky:gate-ack", id: m.id });
        const r = await handlers.current.onGate(m);
        post({ type: "asky:gate-result", id: m.id, allow: r.allow, message: r.message });
      } else if (m.type === "asky:api" || m.type === "asky:ui") {
        handlers.current.onBridge(m);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <iframe
      ref={frame}
      src={src}
      onLoad={() => post({ type: "asky:privacy", blur: !!privacyBlur })}
      className="h-full w-full rounded-lg border border-stone-300 bg-white shadow-sm"
      title="Application"
    />
  );
});

export default AppFrame;
