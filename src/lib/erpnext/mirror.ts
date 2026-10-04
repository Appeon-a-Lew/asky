import "server-only";
import { mutate } from "../store";
import type { CostCenter, DB, Invoice } from "../types";
import { ERPNEXT_URL, erpDoc } from "./client";
import { diffDoc, rememberDoc, type FieldChange } from "./diff";
import { ASSET_FIELD, COMPANY, refOfTitle, toCostCenter, toInvoice, toSupplier } from "./model";

// Read-only mirror of ERPNext's AP data in asky's own shapes, so the same
// pages, guardrails and deviation checks run against the real application.

const PI_FIELDS = ["name", "title", "supplier", "bill_no", "bill_date", "posting_date", "due_date", "currency", "grand_total", "remarks", "docstatus", "on_hold", "hold_comment", "workflow_state", "cost_center", "modified", ASSET_FIELD];

async function costCenters(): Promise<{ list: CostCenter[]; byName: Map<string, CostCenter> }> {
  const rows = await erpDoc.list("Cost Center", { fields: ["name", "cost_center_number", "cost_center_name", "parent_cost_center", "is_group"], filters: [["company", "=", COMPANY]] });
  const byName = new Map<string, CostCenter>();
  for (const r of rows) {
    const c = toCostCenter(r);
    if (c) byName.set(String(r.name), c);
  }
  return { list: [...byName.values()], byName };
}

async function fetchInvoice(name: string, byName: Map<string, CostCenter>): Promise<Invoice> {
  const doc = await erpDoc.get("Purchase Invoice", name);
  rememberDoc(doc); // the baseline the next save is compared against
  return toInvoice(doc, byName);
}

/** Full refresh: every supplier, cost center and purchase invoice of the company. */
export async function syncErpnext(): Promise<DB["erp"]> {
  const [{ list: ccs, byName }, sups, heads] = await Promise.all([
    costCenters(),
    erpDoc.list("Supplier", { fields: ["name", "supplier_name", "country", "tax_id", "supplier_group", "creation"] }),
    erpDoc.list("Purchase Invoice", { fields: PI_FIELDS, filters: [["company", "=", COMPANY], ["docstatus", "<", 2]], order_by: "posting_date asc" }),
  ]);
  const invoices = await Promise.all(heads.map((h) => fetchInvoice(String(h.name), byName)));
  const erp: DB["erp"] = { app: "erpnext", baseUrl: ERPNEXT_URL, syncedAt: Date.now(), invoices, suppliers: sups.map(toSupplier), costCenters: ccs };
  mutate((d) => {
    d.erp = erp;
  });
  return erp;
}

/** The mirrored invoice a screen reference points at: "4471" (title prefix), bill number or ERPNext name. */
export function resolveInvoice(d: DB, ref?: string): Invoice | undefined {
  if (!ref || !d.erp) return undefined;
  const r = ref.trim();
  return d.erp.invoices.find((i) => i.id === r || refOfTitle(i.title) === r || i.number === r || i.title === r);
}

/** Re-read one invoice after the screen showed a change; `diff`: every other field the clerk changed since the last read. */
export async function refreshInvoice(d: DB, ref: string): Promise<{ invoice: Invoice; diff: { changes: FieldChange[]; total?: { from: string; to: string } } | null } | null> {
  if (!d.erp) await syncErpnext();
  const cur = resolveInvoice(d, ref);
  if (!cur?.erpName) return null;
  const [{ byName }, doc] = await Promise.all([costCenters(), erpDoc.get("Purchase Invoice", cur.erpName)]);
  const diff = await diffDoc(doc).catch((e) => (console.warn("[erpnext:diff]", (e as Error).message), null));
  const next = toInvoice(doc, byName);
  mutate((x) => {
    if (!x.erp) return;
    x.erp.invoices = x.erp.invoices.map((i) => (i.erpName === next.erpName ? next : i));
    x.erp.syncedAt = Date.now();
  });
  return { invoice: next, diff };
}
