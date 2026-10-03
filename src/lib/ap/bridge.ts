"use client";

// Instrumentation bridge for the mock AP app.
// The app runs inside an iframe of the apprentice shell (Capture / Teach).
// It reports every API call and UI interaction to the parent, and lets the
// parent hold a mutating call ("gate") — that is how the apprentice can ask
// before an irreversible step or how the tutor blocks a wrong decision.
// Outside an iframe all of this is a no-op, so the app works standalone.

export type BridgeMsg =
  | { type: "asky:api"; method: string; path: string; body?: unknown; status: number; ok: boolean; response?: unknown; ts: number }
  | { type: "asky:ui"; action: "focus" | "input" | "click" | "nav"; field?: string; value?: string; label?: string; path?: string; ts: number }
  | { type: "asky:gate"; id: string; method: string; path: string; body?: unknown; ts: number };

export type ParentMsg =
  | { type: "asky:gate-ack"; id: string }
  | { type: "asky:gate-result"; id: string; allow: boolean; message?: string }
  | { type: "asky:privacy"; blur: boolean }
  | { type: "asky:highlight"; selector: string | null };

const inFrame = () => typeof window !== "undefined" && window.parent !== window;

export function emit(msg: BridgeMsg) {
  if (inFrame()) window.parent.postMessage(msg, window.location.origin);
}

const pending = new Map<string, { acked: boolean; resolve: (r: { allow: boolean; message?: string }) => void }>();

if (typeof window !== "undefined") {
  window.addEventListener("message", (e: MessageEvent<ParentMsg>) => {
    if (e.origin !== window.location.origin || !e.data || typeof e.data !== "object") return;
    const m = e.data;
    if (m.type === "asky:gate-ack") {
      const p = pending.get(m.id);
      if (p) p.acked = true;
    } else if (m.type === "asky:gate-result") {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        p.resolve({ allow: m.allow, message: m.message });
      }
    } else if (m.type === "asky:privacy") {
      document.documentElement.toggleAttribute("data-asky-blur", m.blur); // attribute, not class: React owns <html className>
    } else if (m.type === "asky:highlight") {
      document.querySelectorAll(".asky-highlight").forEach((el) => el.classList.remove("asky-highlight"));
      if (m.selector) document.querySelector(m.selector)?.classList.add("asky-highlight");
    }
  });
}

/** Ask the parent whether a mutating call may proceed. Resolves allow=true if no parent answers. */
function gate(method: string, path: string, body: unknown): Promise<{ allow: boolean; message?: string }> {
  if (!inFrame()) return Promise.resolve({ allow: true });
  const id = Math.random().toString(36).slice(2);
  return new Promise((resolve) => {
    pending.set(id, { acked: false, resolve });
    emit({ type: "asky:gate", id, method, path, body, ts: Date.now() });
    setTimeout(() => {
      const p = pending.get(id);
      if (p && !p.acked) {
        pending.delete(id);
        resolve({ allow: true });
      }
    }, 700);
  });
}

export class GateBlocked extends Error {}

export async function api<T = unknown>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  if (method !== "GET") {
    const g = await gate(method, path, body);
    if (!g.allow) throw new GateBlocked(g.message || "Held by the apprentice");
  }
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  emit({ type: "asky:api", method, path, body, status: res.status, ok: res.ok, response: summarize(json), ts: Date.now() });
  if (!res.ok) throw new Error((json as { error?: string }).error || `HTTP ${res.status}`);
  return json as T;
}

// Keep postMessage payloads small: the parent only needs ids/status/amounts.
function summarize(json: unknown): unknown {
  if (Array.isArray(json)) return { count: json.length };
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    const pick: Record<string, unknown> = {};
    for (const k of ["id", "status", "costCenter", "assetNumber", "amount", "supplierId", "changed", "holdReason", "error"]) if (k in o) pick[k] = o[k];
    if (o.supplier && typeof o.supplier === "object") pick.supplier = { id: (o.supplier as { id: string }).id };
    return pick;
  }
  return json;
}
