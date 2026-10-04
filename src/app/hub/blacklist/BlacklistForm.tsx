"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const post = (body: Record<string, string>) => fetch("/api/blacklist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

export default function BlacklistForm({ suppliers }: { suppliers: string[] }) {
  const router = useRouter();
  const [f, setF] = useState({ supplierName: suppliers[0] ?? "", reason: "", source: "company Slack announcement", by: "" });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const input = "mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm";
  return (
    <form
      className="space-y-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await post({ action: "add", ...f });
        setErr(r.error ?? "");
        if (!r.error) {
          setF({ ...f, reason: "" });
          router.refresh();
        }
      }}
    >
      <label className="block">Supplier<select value={f.supplierName} onChange={set("supplierName")} className={input}>{suppliers.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className="block">Why<input required value={f.reason} onChange={set("reason")} placeholder="e.g. legal claim pending" className={input} /></label>
      <label className="block">Announced in<input value={f.source} onChange={set("source")} className={input} /></label>
      <label className="block">Your name<input value={f.by} onChange={set("by")} placeholder="e.g. Sabine Weber" className={input} /></label>
      {err && <div className="text-xs text-rose-700">{err}</div>}
      <button className="w-full rounded-md bg-stone-900 py-1.5 text-white">Add to blacklist</button>
    </form>
  );
}

export function RemoveButton({ supplierName }: { supplierName: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        const reason = window.prompt(`Why is ${supplierName} coming off the blacklist?`);
        if (!reason?.trim()) return;
        const by = window.prompt("Your name?") || "Hub";
        await post({ action: "remove", supplierName, reason, by });
        router.refresh();
      }}
      className="rounded-md border border-stone-300 px-2 py-1 text-xs"
    >
      Remove…
    </button>
  );
}

export function SuggestionButtons({ id, action, supplierName }: { id: string; action: "add" | "remove"; supplierName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "apply" | "dismiss") => {
    setBusy(true);
    await post({ action: decision, suggestionId: id });
    setBusy(false);
    router.refresh();
  };
  return (
    <div className="flex gap-2">
      <button disabled={busy} onClick={() => decide("apply")} className="rounded-md bg-stone-900 px-3 py-1 text-xs text-white disabled:opacity-50">{action === "add" ? `Blacklist ${supplierName}` : `Take ${supplierName} off the list`}</button>
      <button disabled={busy} onClick={() => decide("dismiss")} className="rounded-md border border-stone-300 px-3 py-1 text-xs disabled:opacity-50">Dismiss</button>
    </div>
  );
}
