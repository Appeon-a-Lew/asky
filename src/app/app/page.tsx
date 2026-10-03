"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/ap/bridge";
import type { Invoice, Supplier } from "@/lib/types";
import { StatusBadge, fmtMoney } from "./ui";

type Row = Invoice & { supplier?: Supplier };

const TABS = [
  { key: "", label: "All" },
  { key: "open", label: "Open" },
  { key: "on_hold", label: "On hold" },
  { key: "awaiting_approval", label: "Awaiting approval" },
  { key: "posted", label: "Posted" },
];

function Inbox() {
  const sp = useSearchParams();
  const training = sp.get("training") === "1";
  const [tab, setTab] = useState("open");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const q = new URLSearchParams();
    if (tab) q.set("status", tab);
    if (training) q.set("training", "true");
    api<Row[]>("GET", `/api/ap/invoices?${q}`).then(setRows).catch(() => setRows([]));
  }, [tab, training]);

  return (
    <div className="rounded border border-slate-300 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h1 className="text-sm font-semibold">AP Inbox {training && <span className="ml-2 rounded bg-amber-200 px-1.5 text-[11px]">Training cases</span>}</h1>
        <span className="text-slate-500">Month-end close: 31.12.2025</span>
      </div>
      <div className="flex gap-1 border-b border-slate-200 px-3 pt-2" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" onClick={() => setTab(t.key)}
            className={`rounded-t px-3 py-1 ${tab === t.key ? "bg-[#1f3b57] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <table className="w-full">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-3 py-1.5">Doc #</th><th>Supplier</th><th>Date</th><th>Description</th>
            <th className="text-right">Amount</th><th className="pl-4">Cost ctr</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 hover:bg-sky-50">
              <td className="px-3 py-1.5"><Link className="text-sky-700 underline" href={`/app/invoices/${r.id}${training ? "?training=1" : ""}`}>{r.id}</Link></td>
              <td>{r.supplier?.name}</td>
              <td>{r.date}</td>
              <td className="text-slate-600">{r.description}</td>
              <td className="text-right tabular-nums">{fmtMoney(r.amount, r.currency)}</td>
              <td className="pl-4 tabular-nums">{r.costCenter}</td>
              <td><StatusBadge status={r.status} /></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No invoices</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function Page() {
  return <Suspense><Inbox /></Suspense>;
}
