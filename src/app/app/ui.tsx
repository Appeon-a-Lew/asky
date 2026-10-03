import type { Invoice } from "@/lib/types";

export const fmtMoney = (n: number, cur = "EUR") =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: cur }).format(n);

export function StatusBadge({ status }: { status: Invoice["status"] }) {
  const map: Record<Invoice["status"], string> = {
    open: "bg-sky-100 text-sky-800",
    on_hold: "bg-amber-100 text-amber-800",
    awaiting_approval: "bg-violet-100 text-violet-800",
    approved: "bg-emerald-100 text-emerald-800",
    posted: "bg-slate-200 text-slate-600",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${map[status]}`}>{status.replace("_", " ")}</span>;
}

