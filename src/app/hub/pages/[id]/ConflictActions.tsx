"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PageConflict } from "@/lib/types";

// A person decides what is true now. The labels name the people, not "old/new".
export default function ConflictActions({ pageId, conflict }: { pageId: string; conflict: PageConflict }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const decide = async (resolution: "keep_new" | "keep_old" | "both") => {
    setBusy(true);
    await fetch(`/api/pages/${pageId}/conflicts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conflictId: conflict.id, resolution }) });
    setBusy(false);
    router.refresh();
  };
  const btn = "rounded-md px-3 py-1.5 text-sm disabled:opacity-50";
  return (
    <div className="flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => decide("keep_new")} className={`${btn} bg-stone-900 text-white`}>{conflict.kind === "changed" ? `Confirm the change (${conflict.newer.by})` : `Keep ${conflict.newer.by}'s version`}</button>
      <button disabled={busy} onClick={() => decide("keep_old")} className={`${btn} border border-stone-300 bg-white`}>{conflict.kind === "changed" ? "Undo — the earlier version is still true" : "Keep the earlier version"}</button>
      <button disabled={busy} onClick={() => decide("both")} className={`${btn} border border-stone-300 bg-white`}>Both apply (different cases)</button>
    </div>
  );
}
