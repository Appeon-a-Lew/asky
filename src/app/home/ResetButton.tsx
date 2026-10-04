"use client";

import { useRouter } from "next/navigation";

export default function ResetButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        if (!confirm("Reset all knowledge, sessions and invoices to the initial state? (The MCP catalog is kept.)")) return;
        await fetch("/api/reset", { method: "POST" });
        router.refresh();
      }}
      className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400"
    >
      Reset demo
    </button>
  );
}
