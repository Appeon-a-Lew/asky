// Seed ERPNext with the same story as the mock app: Keller Maschinenbau's AP
// queue, its cost centers, suppliers (one is the Czech subsidiary), last
// December's double-bill history and an approval workflow. Idempotent; with
// reset the open queue is deleted and recreated so the demo can be replayed —
// under the same ERPNext names every time (the naming counter is rewound).

import { seedDB } from "../seed";
import type { Invoice, InvoiceLine } from "../types";
import { erpDoc } from "./client";
import { ABBR, ASSET_FIELD, CC_GROUP, COMPANY, COUNTRY, ITEM_GROUP, SUBSIDIARY_GROUP, WF, ccName, invoiceTitle } from "./model";

const HISTORY = ["4398", "4405", "4468"]; // posted last year / earlier this month (duplicate pattern)
const QUEUE = ["4469", "4470", "4471", "4472", "4473", "4474", "4475"];
const TRAINING = ["5101", "5102", "5103", "5104"]; // cases Sabine never showed — for the new hire in Teach
let reset = false;
let training = false;
let log: (s: string) => void = () => {};

async function ensure(doctype: string, name: string, doc: Record<string, unknown>) {
  if (await erpDoc.exists(doctype, name)) return false;
  await erpDoc.insert(doctype, doc);
  log(`  + ${doctype} ${name}`);
  return true;
}

const itemCode = (l: InvoiceLine) => l.description.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60).toUpperCase();

async function setup() {
  const d = seedDB();
  log("▶ master data");
  for (const fy of ["2024", "2025"]) await ensure("Fiscal Year", fy, { year: fy, year_start_date: `${fy}-01-01`, year_end_date: `${fy}-12-31` });

  const root = `${COMPANY} - ${ABBR}`;
  for (const g of Object.values(CC_GROUP)) await ensure("Cost Center", `${g} - ${ABBR}`, { cost_center_name: g, parent_cost_center: root, is_group: 1, company: COMPANY });
  for (const c of d.costCenters) await ensure("Cost Center", ccName(c), { cost_center_name: c.name, cost_center_number: c.code, parent_cost_center: `${CC_GROUP[c.type]} - ${ABBR}`, company: COMPANY });

  for (const g of new Set(Object.values(ITEM_GROUP))) await ensure("Item Group", g, { item_group_name: g, parent_item_group: "All Item Groups" });
  await ensure("Supplier Group", SUBSIDIARY_GROUP, { supplier_group_name: SUBSIDIARY_GROUP, parent_supplier_group: "All Supplier Groups" });

  for (const s of d.suppliers) {
    await ensure("Supplier", s.name, { supplier_name: s.name, supplier_group: s.isSubsidiary ? SUBSIDIARY_GROUP : "Local", country: COUNTRY[s.country] ?? s.country, tax_id: s.vatId, supplier_type: "Company" });
  }
  for (const l of d.invoices.flatMap((i) => i.lines)) {
    await ensure("Item", itemCode(l), { item_code: itemCode(l), item_name: l.description.slice(0, 140), item_group: ITEM_GROUP[l.category], is_stock_item: 0, stock_uom: "Nos", include_item_in_manufacturing: 0 });
  }

  // sandbox only: replaying the demo deletes cancelled invoices together with their ledger entries
  await erpDoc.update("Accounts Settings", "Accounts Settings", { delete_linked_ledger_entries: 1 });

  log("▶ form layout");
  await ensure("Custom Field", `Purchase Invoice-${ASSET_FIELD}`, { dt: "Purchase Invoice", fieldname: ASSET_FIELD, label: "Asset Number", fieldtype: "Data", insert_after: "cost_center", description: "Required when the invoice is booked to a capex cost center" });
  // the expert's judgment fields should be on screen, not behind collapsed or hidden sections
  const prop = async (field: string | null, property: string, value: string, type: string) => {
    const name = `Purchase Invoice-${field ?? "main"}-${property}`;
    if (await erpDoc.exists("Property Setter", name)) {
      const cur = await erpDoc.get<{ value: string }>("Property Setter", name);
      if (cur.value === value) return;
      await erpDoc.update("Property Setter", name, { value });
    } else {
      await erpDoc.insert("Property Setter", field ? { doctype_or_field: "DocField", doc_type: "Purchase Invoice", field_name: field, property, value, property_type: type } : { doctype_or_field: "DocType", doc_type: "Purchase Invoice", property, value, property_type: type });
    }
    log(`  ~ Property Setter ${name} = ${value}`);
  };
  await prop(null, "title_field", "title", "Data"); // header shows "4471 · Fräswerk Ulm GmbH"
  await prop("accounting_dimensions_section", "hidden", "0", "Check"); // ERPNext's setup hides it
  await prop("accounting_dimensions_section", "collapsible", "0", "Check");
  // ERPNext's own "Hold Invoice" blocks payment of a *posted* invoice; a suspected duplicate must not be posted,
  // so holding a draft is a workflow state (below). Undo the earlier layout tweak if present.
  for (const n of ["Purchase Invoice-sb_14-depends_on", "Purchase Invoice-sb_14-collapsible"]) if (await erpDoc.exists("Property Setter", n)) await erpDoc.remove("Property Setter", n);
  await erpDoc.update("System Settings", "System Settings", { enable_onboarding: 0 }); // no "Getting Started" panel over the form

  return d;
}

function piDoc(inv: Invoice, d: ReturnType<typeof seedDB>, docstatus: 0 | 1) {
  const sup = d.suppliers.find((s) => s.id === inv.supplierId)!;
  const cc = d.costCenters.find((c) => c.code === inv.costCenter)!;
  return {
    company: COMPANY,
    supplier: sup.name,
    title: invoiceTitle(inv.id, sup.name),
    bill_no: inv.number,
    bill_date: inv.date,
    set_posting_time: 1,
    posting_date: inv.date,
    due_date: inv.dueDate,
    currency: "EUR",
    cost_center: ccName(cc),
    remarks: inv.description,
    items: inv.lines.map((l) => ({ item_code: itemCode(l), item_name: l.description.slice(0, 140), qty: l.qty, rate: l.unitPrice, cost_center: ccName(cc) })),
    docstatus,
  };
}

async function existing(inv: Invoice) {
  const rows = await erpDoc.list("Purchase Invoice", { fields: ["name", "docstatus"], filters: [["bill_no", "=", inv.number], ["company", "=", COMPANY], ["docstatus", "<", 2]] });
  return rows[0] as { name: string; docstatus: number } | undefined;
}

async function invoices(d: ReturnType<typeof seedDB>) {
  log("▶ purchase invoices");
  for (const id of HISTORY) {
    const inv = d.invoices.find((i) => i.id === id)!;
    if (await existing(inv)) continue;
    const r = await erpDoc.insert<{ name: string }>("Purchase Invoice", piDoc(inv, d, 1));
    log(`  + posted ${r.name}  ${id}`);
  }
  if (reset) {
    // every earlier run of the demo, including cancelled copies — all of them first, so the names can be reused
    for (const id of [...QUEUE, ...TRAINING]) {
      const inv = d.invoices.find((i) => i.id === id)!;
      // newest first: an amended copy ("…-00005-1", from Cancel → Amend) links to its original and blocks its delete
      const runs = (await erpDoc.list("Purchase Invoice", { fields: ["name", "docstatus"], filters: [["bill_no", "=", inv.number], ["company", "=", COMPANY]], order_by: "creation desc" })) as { name: string; docstatus: number }[];
      for (const cur of runs) {
        if (cur.docstatus === 1) await erpDoc.call("frappe.client.cancel", { doctype: "Purchase Invoice", name: cur.name });
        // workflow bookkeeping links to the invoice and blocks the delete
        for (const a of await erpDoc.list("Workflow Action", { filters: [["reference_doctype", "=", "Purchase Invoice"], ["reference_name", "=", cur.name]] })) await erpDoc.remove("Workflow Action", String(a.name));
        await erpDoc.remove("Purchase Invoice", cur.name);
        log(`  - removed ${cur.name}  ${id}`);
      }
    }
    await rewindSeries();
  }
  // a fixed order after a rewound counter: 4471 gets the same ERPNext name on every reset, so open tabs and links keep working
  for (const id of [...QUEUE, ...TRAINING]) {
    const inv = d.invoices.find((i) => i.id === id)!;
    if (!reset && (await existing(inv))) continue;
    if (TRAINING.includes(id) && !training) continue;
    const r = await erpDoc.insert<{ name: string }>("Purchase Invoice", piDoc(inv, d, 0));
    log(`  + draft  ${r.name}  ${id}`);
  }
}

/** Set the Purchase Invoice naming counter back to the highest invoice that still exists ("ACC-PINV-2026-00003" → 3). */
async function rewindSeries() {
  // plain series names only ("ACC-PINV-2026-00012"), not amended copies ("…-00005-1")
  const names = (await erpDoc.list<{ name: string }>("Purchase Invoice", { fields: ["name"] })).map((r) => String(r.name).match(/^(.*?)(\d{4,})$/)).filter((m) => !!m);
  const prefix = names[0]?.[1];
  if (!prefix) return;
  const top = Math.max(0, ...names.filter((m) => m[1] === prefix).map((m) => Number(m[2])));
  const settings = await erpDoc.get<{ modified: string }>("Document Naming Settings", "Document Naming Settings");
  const doc = { doctype: "Document Naming Settings", name: "Document Naming Settings", modified: settings.modified, prefix, current_value: top };
  await erpDoc.call("run_doc_method", { docs: JSON.stringify(doc), method: "update_series_start" });
  log(`  ↺ naming series ${prefix} → ${top}`);
}

async function workflow() {
  log("▶ approval workflow");
  for (const [state, style] of [[WF.draft, ""], [WF.hold, "Danger"], [WF.pending, "Warning"], [WF.approved, "Success"], [WF.posted, "Primary"], [WF.cancelled, "Danger"]]) {
    await ensure("Workflow State", state, { workflow_state_name: state, style });
  }
  for (const a of ["Request Approval", "Approve", "Post", "Hold", "Release", "Cancel"]) await ensure("Workflow Action Master", a, { workflow_action_name: a });
  const name = "Purchase Invoice Approval";
  const user = "Accounts User";
  const role = "Accounts Manager";
  const t = (state: string, action: string, next_state: string, allowed: string) => ({ state, action, next_state, allowed, allow_self_approval: 1 });
  const doc = {
    workflow_name: name,
    document_type: "Purchase Invoice",
    is_active: 1,
    send_email_alert: 0,
    enable_action_confirmation: 1,
    workflow_state_field: "workflow_state",
    states: [
      { state: WF.draft, doc_status: "0", allow_edit: user },
      { state: WF.hold, doc_status: "0", allow_edit: user },
      { state: WF.pending, doc_status: "0", allow_edit: role },
      { state: WF.approved, doc_status: "0", allow_edit: role },
      { state: WF.posted, doc_status: "1", allow_edit: role },
      { state: WF.cancelled, doc_status: "2", allow_edit: role },
    ],
    transitions: [
      t(WF.draft, "Request Approval", WF.pending, user),
      t(WF.pending, "Approve", WF.approved, role),
      t(WF.draft, "Hold", WF.hold, user),
      t(WF.hold, "Release", WF.draft, user),
      t(WF.draft, "Post", WF.posted, role),
      t(WF.approved, "Post", WF.posted, role),
      t(WF.posted, "Cancel", WF.cancelled, role),
    ],
  };
  if (!(await erpDoc.exists("Workflow", name))) {
    await erpDoc.insert("Workflow", doc);
    log(`  + Workflow ${name}`);
    return;
  }
  const cur = await erpDoc.get<{ transitions: { action: string; state: string }[] }>("Workflow", name);
  const want = doc.transitions.map((x) => `${x.state}:${x.action}`).sort().join("|");
  if (cur.transitions.map((x) => `${x.state}:${x.action}`).sort().join("|") === want) return;
  await erpDoc.update("Workflow", name, doc);
  log(`  ~ Workflow ${name} (${doc.transitions.length} transitions)`);
}

export async function seedErpnext(opts: { reset?: boolean; training?: boolean; log?: (s: string) => void } = {}) {
  reset = !!opts.reset;
  training = !!opts.training;
  log = opts.log ?? (() => {});
  const d = await setup();
  // history is posted before the workflow exists (it would otherwise route through approval)
  const hadWorkflow = await erpDoc.exists("Workflow", "Purchase Invoice Approval");
  if (hadWorkflow && reset) await erpDoc.update("Workflow", "Purchase Invoice Approval", { is_active: 0 });
  await invoices(d);
  if (hadWorkflow && reset) await erpDoc.update("Workflow", "Purchase Invoice Approval", { is_active: 1 });
  await workflow();
}
