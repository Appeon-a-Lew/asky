"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Page } from "@/lib/types";

export default function PageActions({ pageId, status }: { pageId: string; status: Page["status"] }) {
  const router = useRouter();
  const [edge, setEdge] = useState("");
  const [open, setOpen] = useState(false);
  const patch = async (body: Record<string, unknown>) => {
    await fetch(`/api/pages/${pageId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    router.refresh();
  };
  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex gap-2 text-sm">
        {status !== "confirmed" && <button onClick={() => patch({ status: "confirmed" })} className="rounded-md bg-emerald-700 px-3 py-1.5 text-white">Confirm</button>}
        {status !== "stale" && <button onClick={() => patch({ status: "stale" })} className="rounded-md border border-stone-300 px-3 py-1.5">Mark outdated</button>}
        <button onClick={() => setOpen((o) => !o)} className="rounded-md border border-stone-300 px-3 py-1.5">+ Edge case</button>
      </div>
      {open && (
        <form className="flex w-96 gap-2" onSubmit={(e) => { e.preventDefault(); if (edge.trim()) patch({ addEdgeCase: edge.trim() }).then(() => { setEdge(""); setOpen(false); }); }}>
          <input autoFocus value={edge} onChange={(e) => setEdge(e.target.value)} placeholder="e.g. Leasing equipment stays opex" className="flex-1 rounded-md border border-stone-300 px-2 py-1 text-sm" />
          <button className="rounded-md bg-stone-900 px-3 text-sm text-white">Add</button>
        </form>
      )}
    </div>
  );
}
