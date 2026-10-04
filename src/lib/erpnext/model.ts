import type { CostCenter, CostCenterType, Invoice, InvoiceLine, InvoiceStatus, Supplier } from "../types";

// How the asky AP vocabulary is laid out inside ERPNext. Shared by the seed
// script (writes it) and the mirror (reads it back).

export const COMPANY = "Keller Maschinenbau GmbH";
export const ABBR = "KM";
export const SUBSIDIARY_GROUP = "Group Companies";
export const ASSET_FIELD = "asset_number"; // custom field on Purchase Invoice (created via API, so no custom_ prefix)

export const CC_GROUP: Record<CostCenterType, string> = { opex: "Opex", capex: "Capex" };
/** "4711" → "4711 - Production maintenance - KM" (ERPNext names cost centers "<number> - <name> - <abbr>") */
export const ccName = (c: CostCenter) => `${c.code} - ${c.name} - ${ABBR}`;

export const ITEM_GROUP: Record<InvoiceLine["category"], string> = {
  material: "Raw Material",
  service: "Services",
  equipment: "Equipment",
  office: "Office Supplies",
  logistics: "Logistics",
  intercompany: "Intercompany",
};
const CATEGORY = Object.fromEntries(Object.entries(ITEM_GROUP).map(([k, v]) => [v, k])) as Record<string, InvoiceLine["category"]>;

export const COUNTRY: Record<string, string> = { DE: "Germany", CZ: "Czech Republic" };
const ISO = Object.fromEntries(Object.entries(COUNTRY).map(([k, v]) => [v, k]));

/** Workflow states on Purchase Invoice and what they mean for asky. */
export const WF = { draft: "Draft", hold: "On Hold", pending: "Pending Approval", approved: "Approved", posted: "Posted", cancelled: "Cancelled" };

export const invoiceTitle = (id: string, supplierName: string) => `${id} · ${supplierName}`;
/** "4471 · Fräswerk Ulm GmbH" → "4471" */
export const refOfTitle = (title?: string) => title?.match(/^(\w[\w-]*)\s·/)?.[1];

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));

export function toCostCenter(r: Row): CostCenter | null {
  const code = str(r.cost_center_number);
  if (!code || r.is_group) return null;
  return { code, name: str(r.cost_center_name), type: /capex/i.test(str(r.parent_cost_center)) ? "capex" : "opex" };
}

export function toSupplier(r: Row): Supplier {
  return {
    id: str(r.name),
    name: str(r.supplier_name),
    country: ISO[str(r.country)] ?? str(r.country),
    vatId: str(r.tax_id),
    iban: "",
    contactEmail: "",
    isSubsidiary: str(r.supplier_group) === SUBSIDIARY_GROUP,
    createdAt: str(r.creation).slice(0, 10),
  };
}

export function toInvoice(r: Row, ccByName: Map<string, CostCenter>): Invoice {
  const items = (r.items as Row[] | undefined) ?? [];
  const wf = str(r.workflow_state);
  const status: InvoiceStatus =
    r.docstatus === 1 || wf === WF.posted ? "posted" : r.on_hold || wf === WF.hold ? "on_hold" : wf === WF.pending ? "awaiting_approval" : wf === WF.approved ? "approved" : "open";
  const cc = ccByName.get(str(r.cost_center)) ?? ccByName.get(str(items[0]?.cost_center));
  return {
    id: str(r.name), // never collides with the mock app's ids

    number: str(r.bill_no),
    supplierId: str(r.supplier),
    date: str(r.bill_date || r.posting_date),
    dueDate: str(r.due_date),
    currency: str(r.currency) === "CZK" ? "CZK" : "EUR",
    amount: Number(r.grand_total ?? 0),
    description: str(r.remarks) || str(items[0]?.item_name),
    lines: items.map((i) => ({ description: str(i.item_name || i.description), qty: Number(i.qty), unitPrice: Number(i.rate), category: CATEGORY[str(i.item_group)] ?? "service" })),
    costCenter: cc?.code ?? "",
    assetNumber: str(r[ASSET_FIELD]) || undefined,
    status,
    holdReason: str(r.hold_comment) || undefined,
    approvals: wf === WF.pending || wf === WF.approved ? [{ approver: "Controlling", role: "controller", requestedAt: str(r.modified), approvedAt: wf === WF.approved ? str(r.modified) : undefined }] : [],
    notes: [],
    postedAt: status === "posted" ? str(r.modified) : undefined,
    title: str(r.title),
    source: "erpnext",
    erpName: str(r.name),
  };
}
