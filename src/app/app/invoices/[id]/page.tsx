"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { api, GateBlocked } from "@/lib/ap/bridge";
import type { CostCenter, Invoice, Supplier } from "@/lib/types";
import { StatusBadge, fmtMoney } from "../../ui";

type Full = Invoice & { supplier?: Supplier; costCenterInfo?: CostCenter };

const APPROVERS = [
  { approver: "K. Bauer", role: "department_head", label: "K. Bauer — Head of Production (department head)" },
  { approver: "Dr. M. Fischer", role: "controller", label: "Dr. M. Fischer — Controller" },
  { approver: "J. Klein", role: "cfo", label: "J. Klein — CFO" },
] as const;

type Modal = null | "hold" | "approval" | "note" | "post";

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [inv, setInv] = useState<Full | null>(null);
  const [ccs, setCcs] = useState<CostCenter[]>([]);
  const [cc, setCc] = useState("");
  const [asset, setAsset] = useState("");
  const [history, setHistory] = useState<Invoice[] | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [text, setText] = useState("");
  const [approver, setApprover] = useState(0);
  const [banner, setBanner] = useState<{ kind: "ok" | "err" | "held"; text: string } | null>(null);

  const load = useCallback(async () => {
    const i = await api<Full>("GET", `/api/ap/invoices/${id}`);
    setInv(i);
    setCc(i.costCenter);
    setAsset(i.assetNumber ?? "");
  }, [id]);

  useEffect(() => {
    let alive = true;
    api<Full>("GET", `/api/ap/invoices/${id}`).then((i) => {
      if (!alive) return;
      setInv(i);
      setCc(i.costCenter);
      setAsset(i.assetNumber ?? "");
    });
    api<CostCenter[]>("GET", "/api/ap/cost-centers").then((c) => alive && setCcs(c));
    return () => {
      alive = false;
    };
  }, [id]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      setBanner({ kind: "ok", text: ok });
      setModal(null);
      setText("");
      await load();
    } catch (e) {
      if (e instanceof GateBlocked) setBanner({ kind: "held", text: e.message });
      else setBanner({ kind: "err", text: (e as Error).message });
      setModal(null);
    }
  }

  if (!inv) return <div className="p-6 text-slate-500">Loading…</div>;
  const posted = inv.status === "posted";
  const backHref = inv.training ? "/app?training=1" : "/app";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Link href={backHref} className="text-sky-700 underline">← Inbox</Link>
        <h1 className="text-base font-semibold">Invoice {inv.id}</h1>
        <StatusBadge status={inv.status} />
        {inv.holdReason && <span className="text-amber-700">Hold: {inv.holdReason}</span>}
      </div>

      {banner && (
        <div className={`rounded border px-3 py-2 ${banner.kind === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : banner.kind === "held" ? "border-amber-400 bg-amber-50 text-amber-900" : "border-red-300 bg-red-50 text-red-800"}`}>
          {banner.kind === "held" ? "⏸ " : ""}{banner.text}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <section className="col-span-2 space-y-3">
          <div className="rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-2 font-semibold text-slate-600">Header</h2>
            <dl className="grid grid-cols-4 gap-x-4 gap-y-1">
              <dt className="text-slate-500">Supplier inv. #</dt><dd>{inv.number}</dd>
              <dt className="text-slate-500">Invoice date</dt><dd>{inv.date}</dd>
              <dt className="text-slate-500">Due date</dt><dd>{inv.dueDate}</dd>
              <dt className="text-slate-500">PO</dt><dd>{inv.poNumber ?? <span className="text-slate-400">— none —</span>}</dd>
              <dt className="text-slate-500">Description</dt><dd className="col-span-3">{inv.description}</dd>
              <dt className="text-slate-500">Gross amount</dt><dd className="col-span-3 text-lg font-semibold tabular-nums" data-field="amount">{fmtMoney(inv.amount, inv.currency)}</dd>
            </dl>
          </div>

          <div className="rounded border border-slate-300 bg-white p-3" data-field="supplier">
            <h2 className="mb-2 font-semibold text-slate-600">Supplier</h2>
            <dl className="grid grid-cols-4 gap-x-4 gap-y-1">
              <dt className="text-slate-500">Name</dt><dd className="col-span-3 font-medium">{inv.supplier?.name}{inv.supplier?.isSubsidiary && <span className="ml-2 rounded bg-slate-200 px-1 text-[11px]">group company</span>}</dd>
              <dt className="text-slate-500">Country</dt><dd>{inv.supplier?.country}</dd>
              <dt className="text-slate-500">VAT ID</dt><dd>{inv.supplier?.vatId}</dd>
              <dt className="text-slate-500">IBAN</dt><dd className="col-span-3" data-pii>{inv.supplier?.iban}</dd>
              <dt className="text-slate-500">Contact</dt><dd className="col-span-3" data-pii>{inv.supplier?.contactEmail}</dd>
              <dt className="text-slate-500">Supplier since</dt><dd>{inv.supplier?.createdAt}</dd>
            </dl>
            <button className="mt-2 rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
              onClick={() => api<{ invoices: Invoice[] }>("GET", `/api/ap/suppliers/${inv.supplierId}/invoices`).then((r) => setHistory(r.invoices))}>
              Show supplier history
            </button>
            {history && (
              <table className="mt-2 w-full" data-field="supplierHistory">
                <thead className="text-left text-slate-500"><tr><th>Doc #</th><th>Date</th><th>Description</th><th className="text-right">Amount</th><th className="pl-3">Status</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className={`border-t border-slate-100 ${h.id === inv.id ? "bg-sky-50" : ""}`}>
                      <td>{h.id}</td><td>{h.date}</td><td>{h.description}</td><td className="text-right tabular-nums">{fmtMoney(h.amount, h.currency)}</td><td className="pl-3"><StatusBadge status={h.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-2 font-semibold text-slate-600">Lines</h2>
            <table className="w-full">
              <thead className="text-left text-slate-500"><tr><th>Description</th><th>Category</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {inv.lines.map((l, k) => (
                  <tr key={k} className="border-t border-slate-100">
                    <td>{l.description}</td><td>{l.category}</td><td className="text-right">{l.qty}</td>
                    <td className="text-right tabular-nums">{fmtMoney(l.unitPrice, inv.currency)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(l.qty * l.unitPrice, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(inv.notes.length > 0 || inv.approvals.length > 0) && (
            <div className="rounded border border-slate-300 bg-white p-3">
              <h2 className="mb-2 font-semibold text-slate-600">Workflow</h2>
              {inv.approvals.map((a, k) => (
                <div key={k}>Approval: {a.approver} ({a.role}) — {a.approvedAt ? `approved ${a.approvedAt.slice(0, 10)}` : "pending"}{a.reason ? ` · ${a.reason}` : ""}</div>
              ))}
              {inv.notes.map((n, k) => <div key={k} className="text-slate-600">📝 {n.at.slice(0, 10)} {n.by}: {n.text}</div>)}
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <div className="rounded border border-slate-300 bg-white p-3" id="coding-panel">
            <h2 className="mb-2 font-semibold text-slate-600">Account assignment</h2>
            <label className="block text-slate-500">Cost center</label>
            <select name="costCenter" data-field="costCenter" disabled={posted} value={cc} onChange={(e) => setCc(e.target.value)}
              className="mb-2 w-full rounded border border-slate-300 px-2 py-1">
              {ccs.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
            <label className="block text-slate-500">Asset number</label>
            <input name="assetNumber" data-field="assetNumber" disabled={posted} value={asset} onChange={(e) => setAsset(e.target.value)}
              placeholder="e.g. AN-2025-0142" className="mb-2 w-full rounded border border-slate-300 px-2 py-1" />
            <button disabled={posted} className="w-full rounded bg-[#1f3b57] px-2 py-1.5 text-white disabled:opacity-40"
              onClick={() => run(() => api("PATCH", `/api/ap/invoices/${inv.id}/coding`, { costCenter: cc, assetNumber: asset }), "Coding saved")}>
              Save coding
            </button>
          </div>

          <div className="space-y-1.5 rounded border border-slate-300 bg-white p-3" id="actions-panel">
            <h2 className="mb-1 font-semibold text-slate-600">Actions</h2>
            {inv.status === "on_hold" ? (
              <button className="w-full rounded border border-amber-400 px-2 py-1.5 hover:bg-amber-50"
                onClick={() => run(() => api("POST", `/api/ap/invoices/${inv.id}/release`), "Released from hold")}>Release hold</button>
            ) : (
              <button disabled={posted} className="w-full rounded border border-amber-400 px-2 py-1.5 hover:bg-amber-50 disabled:opacity-40" onClick={() => setModal("hold")}>Put on hold…</button>
            )}
            <button disabled={posted} className="w-full rounded border border-violet-400 px-2 py-1.5 hover:bg-violet-50 disabled:opacity-40" onClick={() => setModal("approval")}>Request approval…</button>
            {inv.status === "awaiting_approval" && (
              <button className="w-full rounded border border-emerald-400 px-2 py-1.5 hover:bg-emerald-50"
                onClick={() => {
                  const a = inv.approvals.find((x) => !x.approvedAt);
                  if (a) run(() => api("POST", `/api/ap/invoices/${inv.id}/approve`, { approver: a.approver }), `Approval by ${a.approver} recorded`);
                }}>Record approval received</button>
            )}
            <button className="w-full rounded border border-slate-300 px-2 py-1.5 hover:bg-slate-50" onClick={() => setModal("note")}>Add note…</button>
            <button disabled={posted} className="w-full rounded bg-emerald-700 px-2 py-1.5 font-medium text-white disabled:opacity-40" onClick={() => setModal("post")}>Post invoice</button>
          </div>
        </aside>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role={modal === "post" ? "alertdialog" : "dialog"}>
          <div className="w-96 rounded border border-slate-300 bg-white p-4 shadow-lg">
            {modal === "hold" && (<>
              <h3 className="mb-2 font-semibold">Put invoice {inv.id} on hold</h3>
              <textarea name="holdReason" data-field="holdReason" value={text} onChange={(e) => setText(e.target.value)} placeholder="Reason" className="h-20 w-full rounded border border-slate-300 p-2" />
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setModal(null)}>Cancel</button>
                <button className="rounded bg-amber-600 px-3 py-1 text-white" onClick={() => run(() => api("POST", `/api/ap/invoices/${inv.id}/hold`, { reason: text || "On hold" }), "Invoice on hold")}>Hold</button>
              </div>
            </>)}
            {modal === "approval" && (<>
              <h3 className="mb-2 font-semibold">Request approval for {inv.id}</h3>
              <select name="approver" data-field="approver" value={approver} onChange={(e) => setApprover(Number(e.target.value))} className="mb-2 w-full rounded border border-slate-300 px-2 py-1">
                {APPROVERS.map((a, k) => <option key={a.approver} value={k}>{a.label}</option>)}
              </select>
              <input name="approvalReason" data-field="approvalReason" value={text} onChange={(e) => setText(e.target.value)} placeholder="Reason (optional)" className="w-full rounded border border-slate-300 px-2 py-1" />
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setModal(null)}>Cancel</button>
                <button className="rounded bg-violet-700 px-3 py-1 text-white" onClick={() => {
                  const a = APPROVERS[approver];
                  run(() => api("POST", `/api/ap/invoices/${inv.id}/approval-requests`, { approver: a.approver, role: a.role, reason: text || undefined }), `Sent to ${a.approver}`);
                }}>Send</button>
              </div>
            </>)}
            {modal === "note" && (<>
              <h3 className="mb-2 font-semibold">Add note</h3>
              <textarea name="note" data-field="note" value={text} onChange={(e) => setText(e.target.value)} className="h-20 w-full rounded border border-slate-300 p-2" />
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setModal(null)}>Cancel</button>
                <button className="rounded bg-[#1f3b57] px-3 py-1 text-white" onClick={() => run(() => api("POST", `/api/ap/invoices/${inv.id}/notes`, { text }), "Note added")}>Save</button>
              </div>
            </>)}
            {modal === "post" && (<>
              <h3 className="mb-2 font-semibold">Post invoice {inv.id}?</h3>
              <p className="text-slate-600" data-confirm="irreversible">
                {fmtMoney(inv.amount, inv.currency)} to cost center {inv.costCenter}. Posting releases the invoice for Friday&apos;s payment run. <b>This cannot be undone.</b>
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setModal(null)}>Cancel</button>
                <button className="rounded bg-emerald-700 px-3 py-1 text-white" onClick={() => run(() => api("POST", `/api/ap/invoices/${inv.id}/post`), "Invoice posted")}>Post now</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
