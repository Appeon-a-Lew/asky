import type { CaseContext, Condition, DB, Page } from "../types";

// Case context = everything a rule can look at for one invoice.

export function buildCaseContext(d: DB, caseId: string, trace: string[] = [], knownSupplierIds?: Set<string>): CaseContext | null {
  // cases of a real application (ERPNext) live in its mirror; ids never collide with the mock's
  const src = d.erp?.invoices.some((i) => i.id === caseId) ? d.erp : d;
  const invoice = src.invoices.find((i) => i.id === caseId);
  if (!invoice) return null;
  const supplier = src.suppliers.find((s) => s.id === invoice.supplierId);
  if (!supplier) return null;
  const cc = src.costCenters.find((c) => c.code === invoice.costCenter);
  // suppliers seen in observed traces — by id and by name, so knowledge from the mock app carries over to a real one
  const known = knownSupplierIds ?? new Set(d.graph.traces.flatMap((t) => {
    const i = d.invoices.find((x) => x.id === t.caseId) ?? d.erp?.invoices.find((x) => x.id === t.caseId);
    const s = i && (d.suppliers.find((x) => x.id === i.supplierId) ?? d.erp?.suppliers.find((x) => x.id === i.supplierId));
    return s ? [s.id, s.name] : [];
  }));
  const listed = activeListing(d, supplier.name);
  const same = src.invoices.filter((i) => i.supplierId === invoice.supplierId && i.id !== invoice.id && !i.training && i.date <= invoice.date && Math.abs(i.amount - invoice.amount) < 0.01).length;
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
    supplier: { ...supplier, isNew: !known.has(supplier.id) && !known.has(supplier.name), priorInvoicesSameAmount: same, blacklisted: !!listed, blacklistReason: listed?.reason },
    trace,
  };
}

export const bareName = (n: string) => n.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();

/** The supplier's current blacklist listing, if any (by name: the same supplier in the mock app and in ERPNext). */
export function activeListing(d: DB, supplierName: string) {
  const n = bareName(supplierName);
  return (d.blacklist ?? []).find((b) => !b.removedAt && bareName(b.supplierName) === n);
}

/** How people call a case: "4473" — for a real app's case its own number from the title, not the document name. */
export function caseLabel(d: DB, caseId?: string): string {
  if (!caseId) return "";
  const i = d.erp?.invoices.find((x) => x.id === caseId);
  return i?.title?.match(/^(\w[\w-]*)\s·/)?.[1] ?? caseId;
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
