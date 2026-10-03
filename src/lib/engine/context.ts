import type { CaseContext, Condition, DB, Page } from "../types";

// Case context = everything a rule can look at for one invoice.

export function buildCaseContext(d: DB, caseId: string, trace: string[] = [], knownSupplierIds?: Set<string>): CaseContext | null {
  const invoice = d.invoices.find((i) => i.id === caseId);
  if (!invoice) return null;
  const supplier = d.suppliers.find((s) => s.id === invoice.supplierId)!;
  const cc = d.costCenters.find((c) => c.code === invoice.costCenter);
  const known = knownSupplierIds ?? new Set(d.graph.traces.map((t) => d.invoices.find((i) => i.id === t.caseId)?.supplierId).filter(Boolean) as string[]);
  const same = d.invoices.filter((i) => i.supplierId === invoice.supplierId && i.id !== invoice.id && !i.training && i.date <= invoice.date && Math.abs(i.amount - invoice.amount) < 0.01).length;
  return {
    invoice: {
      ...invoice,
      month: Number(invoice.date.slice(5, 7)),
      costCenterType: cc?.type,
      hasAssetNumber: !!invoice.assetNumber,
      lineCategories: [...new Set(invoice.lines.map((l) => l.category))],
      maxLineValue: Math.max(...invoice.lines.map((l) => l.qty * l.unitPrice)),
      approvalRoles: invoice.approvals.map((a) => a.role),
      approvedRoles: invoice.approvals.filter((a) => a.approvedAt).map((a) => a.role),
    },
    supplier: { ...supplier, isNew: !known.has(supplier.id), priorInvoicesSameAmount: same },
    trace,
  };
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function evalCondition(c: Condition, scope: unknown): boolean {
  const v = getPath(scope, c.field);
  const t = c.value;
  switch (c.op) {
    case "exists": return v !== undefined && v !== null && v !== "" && v !== false;
    case "missing": return v === undefined || v === null || v === "" || v === false;
    case "eq": return String(v) === String(t);
    case "neq": return String(v) !== String(t);
    case "gt": return Number(v) > Number(t);
    case "gte": return Number(v) >= Number(t);
    case "lt": return Number(v) < Number(t);
    case "lte": return Number(v) <= Number(t);
    case "in": return Array.isArray(t) && t.map(String).includes(String(v));
    case "contains":
      if (Array.isArray(v)) return v.map(String).includes(String(t));
      return typeof v === "string" && v.toLowerCase().includes(String(t).toLowerCase());
  }
}

export const evalAll = (cs: Condition[] | undefined, scope: unknown) => (cs ?? []).every((c) => evalCondition(c, scope));

export function describeCondition(c: Condition): string {
  const ops: Record<string, string> = { eq: "=", neq: "≠", gt: ">", gte: "≥", lt: "<", lte: "≤", in: "in", contains: "contains", exists: "is set", missing: "is missing" };
  return `${c.field} ${ops[c.op]}${c.value !== undefined ? " " + (Array.isArray(c.value) ? c.value.join("/") : c.value) : ""}`;
}

/** Pages whose trigger conditions hold for this case. */
export function matchPages(pages: Page[], ctx: CaseContext): Page[] {
  return pages.filter((p) => p.triggers.length > 0 && evalAll(p.triggers, ctx));
}
