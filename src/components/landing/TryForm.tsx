"use client";

import { useState } from "react";

// Audience entry: the event code from the slide → a private workspace.
export default function TryForm({ expired }: { expired?: boolean }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(expired ? "Your demo workspace has expired — enter the code to start a new one." : "");
  return (
    <form
      className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }).then((x) => x.json()).catch(() => ({ error: "Network error — try again" }));
        setBusy(false);
        if (r.error) return setErr(r.error);
        window.location.href = r.redirect ?? "/start";
      }}
    >
      <label className="sr-only" htmlFor="code">Event code</label>
      <input id="code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Event code from the slide" autoComplete="off" className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100" />
      <button disabled={busy} className="rounded-xl bg-stone-900 px-5 py-3 font-medium text-white transition hover:bg-stone-800 disabled:opacity-60">{busy ? "Creating your workspace…" : "Try it yourself"}</button>
      {err && <p className="text-sm text-rose-700 sm:basis-full">{err}</p>}
    </form>
  );
}
