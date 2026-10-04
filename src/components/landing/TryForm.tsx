"use client";

import { useState } from "react";

// Audience entry: one click → a private workspace. No code to type.
export default function TryForm({ expired }: { expired?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(expired ? "Your demo workspace has expired — start a new one." : "");
  return (
    <form
      className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((x) => x.json()).catch(() => ({ error: "Network error — try again" }));
        setBusy(false);
        if (r.error) return setErr(r.error);
        window.location.href = r.redirect ?? "/start";
      }}
    >
      <button disabled={busy} className="rounded-xl bg-stone-900 px-5 py-3 font-medium text-white transition hover:bg-stone-800 disabled:opacity-60">{busy ? "Creating your workspace…" : "Try it yourself"}</button>
      {err && <p className="text-sm text-rose-700 sm:basis-full">{err}</p>}
    </form>
  );
}
