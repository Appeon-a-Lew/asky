"use client";

import { useState } from "react";

// The presenter's way in: the main workspace with ERPNext and the curated knowledge.
export default function Presenter() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="grid min-h-screen place-items-center bg-stone-950 px-4">
      <form
        className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ presenter: pw }) }).then((x) => x.json()).catch(() => ({ error: "Network error" }));
          if (r.error) return setErr(r.error);
          window.location.href = r.redirect ?? "/home";
        }}
      >
        <h1 className="text-lg font-semibold text-stone-900">Presenter</h1>
        <input type="password" required autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" className="w-full rounded-lg border border-stone-300 px-3 py-2" />
        {err && <p className="text-sm text-rose-700">{err}</p>}
        <button className="w-full rounded-lg bg-stone-900 py-2 font-medium text-white">Enter</button>
      </form>
    </div>
  );
}
