"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Rediscover() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} onClick={async () => { setBusy(true); await fetch("/api/harness/discover", { method: "POST" }); setBusy(false); router.refresh(); }} className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50">
      {busy ? "Discovering…" : "↻ Rediscover"}
    </button>
  );
}
