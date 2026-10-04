import type { Condition, DB, ExecGraph, Invoice, Supplier } from "./types";

// Fictional machine builder near Stuttgart. Every name here is invented.
export const COMPANY = "Keller Maschinenbau GmbH";

const suppliers: Supplier[] = [
  { id: "SUP-HYD", name: "Hydrotec Antriebe GmbH", country: "DE", vatId: "DE811234567", iban: "DE44 6005 0101 0004 1234 56", contactEmail: "ar@hydrotec.example", isSubsidiary: false, createdAt: "2014-03-02" },
  { id: "SUP-SCH", name: "Schmidt Logistik KG", country: "DE", vatId: "DE299887766", iban: "DE12 6105 0000 0012 3456 78", contactEmail: "billing@schmidt-log.example", isSubsidiary: false, createdAt: "2016-07-19" },
  { id: "SUP-FRW", name: "Fräswerk Ulm GmbH", country: "DE", vatId: "DE300112233", iban: "DE89 6305 0000 0001 9988 77", contactEmail: "rechnung@fraeswerk.example", isSubsidiary: false, createdAt: "2019-11-04" },
  { id: "SUP-KCZ", name: "Keller CZ s.r.o.", country: "CZ", vatId: "CZ27654321", iban: "CZ65 0800 0000 1920 0014 5399", contactEmail: "ucetni@keller-cz.example", isSubsidiary: true, createdAt: "2012-01-10" },
  { id: "SUP-NRD", name: "Nordlicht Bürobedarf GmbH", country: "DE", vatId: "DE277665544", iban: "DE02 1203 0000 0000 2020 51", contactEmail: "invoices@nordlicht.example", isSubsidiary: false, createdAt: "2010-05-21" },
  { id: "SUP-CLP", name: "CleanPro Facility Services", country: "DE", vatId: "DE288112200", iban: "DE75 5121 0800 1245 1261 99", contactEmail: "ar@cleanpro.example", isSubsidiary: false, createdAt: "2018-02-14" },
  { id: "SUP-NOV", name: "Novák Metal a.s.", country: "CZ", vatId: "CZ45678123", iban: "CZ42 0300 0000 0002 7714 1023", contactEmail: "fakturace@novak-metal.example", isSubsidiary: false, createdAt: "2021-09-01" },
  // Never seen by the expert — used for the "case the expert never showed" test.
  { id: "SUP-PHB", name: "Pressenbau Heilbronn GmbH", country: "DE", vatId: "DE315550011", iban: "DE61 6205 0000 0000 7788 99", contactEmail: "buchhaltung@pressenbau.example", isSubsidiary: false, createdAt: "2025-12-01" },
];

const inv = (i: Partial<Invoice> & Pick<Invoice, "id" | "supplierId" | "amount" | "description" | "lines" | "costCenter" | "date">): Invoice => ({
  number: `RE-${i.id}`,
  dueDate: i.date,
  currency: "EUR",
  status: "open",
  approvals: [],
  notes: [],
  ...i,
});

const invoices: Invoice[] = [
  // History (already posted) — needed for duplicate checks
  inv({ id: "4398", supplierId: "SUP-NRD", date: "2024-12-03", amount: 1176.2, description: "Office supplies Q4", lines: [{ description: "Toner, paper, folders", qty: 1, unitPrice: 1176.2, category: "office" }], costCenter: "4720", status: "posted", postedAt: "2024-12-05" }),
  inv({ id: "4405", supplierId: "SUP-NRD", date: "2024-12-17", amount: 1176.2, description: "Office supplies Q4", lines: [{ description: "Toner, paper, folders", qty: 1, unitPrice: 1176.2, category: "office" }], costCenter: "4720", status: "on_hold", holdReason: "Duplicate of 4398 — supplier re-sent December invoice", notes: [{ at: "2024-12-18", by: "Sabine Weber", text: "Again the December duplicate. Called Nordlicht, credit note promised." }] }),
  inv({ id: "4468", supplierId: "SUP-NRD", date: "2025-12-02", amount: 1284.5, description: "Office supplies Q4", lines: [{ description: "Toner, paper, binders", qty: 1, unitPrice: 1284.5, category: "office" }], costCenter: "4720", status: "posted", postedAt: "2025-12-04" }),

  // Expert's open work queue (Thursday, two days before month-end close)
  inv({ id: "4469", supplierId: "SUP-HYD", date: "2025-12-15", dueDate: "2026-01-14", amount: 2140.0, description: "Hydraulic seal kits", poNumber: "PO-88121", lines: [{ description: "Seal kit HX-40", qty: 20, unitPrice: 107, category: "material" }], costCenter: "4711" }),
  inv({ id: "4470", supplierId: "SUP-SCH", date: "2025-12-16", dueDate: "2026-01-15", amount: 860.0, description: "Freight Stuttgart → Ulm", lines: [{ description: "Truck transport 12/11", qty: 1, unitPrice: 860, category: "logistics" }], costCenter: "4800" }),
  inv({ id: "4471", supplierId: "SUP-FRW", date: "2025-12-16", dueDate: "2026-01-15", amount: 7850.0, description: "CNC spindle unit SP-220", poNumber: "PO-88140", lines: [{ description: "Spindle unit SP-220 incl. mounting", qty: 1, unitPrice: 7850, category: "equipment" }], costCenter: "4711" }),
  inv({ id: "4472", supplierId: "SUP-KCZ", date: "2025-12-17", dueDate: "2026-01-16", amount: 3200.0, description: "Intercompany machining services Nov", lines: [{ description: "Machining hours Nov (120h)", qty: 120, unitPrice: 26.67, category: "intercompany" }], costCenter: "4711" }),
  inv({ id: "4473", supplierId: "SUP-NRD", date: "2025-12-18", dueDate: "2026-01-17", amount: 1284.5, description: "Office supplies Q4", lines: [{ description: "Toner, paper, binders", qty: 1, unitPrice: 1284.5, category: "office" }], costCenter: "4720" }),
  inv({ id: "4474", supplierId: "SUP-CLP", date: "2025-12-18", dueDate: "2026-01-17", amount: 1950.0, description: "Facility cleaning December", lines: [{ description: "Cleaning services Dec", qty: 1, unitPrice: 1950, category: "service" }], costCenter: "4720" }),
  inv({ id: "4475", supplierId: "SUP-SCH", date: "2025-12-19", dueDate: "2026-01-18", amount: 1240.0, description: "Freight Ulm → Hamburg port", lines: [{ description: "Truck transport 12/18, 2 pallets", qty: 1, unitPrice: 1240, category: "logistics" }], costCenter: "4800" }),

  // Training cases for the new hire — never shown by the expert
  inv({ id: "5101", supplierId: "SUP-PHB", date: "2025-12-19", dueDate: "2026-01-18", amount: 6400.0, description: "Hydraulic press tool set PT-9", poNumber: "PO-88177", lines: [{ description: "Press tool set PT-9", qty: 1, unitPrice: 6400, category: "equipment" }], costCenter: "4711", training: true }),
  inv({ id: "5102", supplierId: "SUP-KCZ", date: "2025-12-19", dueDate: "2026-01-18", amount: 2080.0, description: "Intercompany tooling service Dec", lines: [{ description: "Tool refurbishment (78h)", qty: 78, unitPrice: 26.67, category: "intercompany" }], costCenter: "4711", training: true }),
  inv({ id: "5103", supplierId: "SUP-NRD", date: "2025-12-20", dueDate: "2026-01-19", amount: 640.0, description: "Ergonomic chairs (2)", lines: [{ description: "Office chair ErgoPlus", qty: 2, unitPrice: 320, category: "office" }], costCenter: "4720", training: true }),
  inv({ id: "5104", supplierId: "SUP-NOV", date: "2025-12-20", dueDate: "2026-01-19", amount: 1420.0, description: "Steel profiles", lines: [{ description: "Steel profile S235 (40m)", qty: 40, unitPrice: 35.5, category: "material" }], costCenter: "4711", training: true }),
];

const PROCESS_DOC_2019 = `# Accounts Payable — Invoice Processing (v2.1, 2019)

Owner: Finance / AP team · Last reviewed: 03/2019

## Steps
1. Open the invoice from the AP inbox.
2. Check supplier name and amount against the PO.
3. Assign the cost center. The OCR pre-coding is usually correct.
4. Invoices above **€10,000** need approval from the department head before posting.
5. Post the invoice. Payment run is every Friday.

## Notes
- Questions go to the AP team lead.
`;

/** The 2019 doc, mapped onto the app's tools — the baseline graph before any expert is observed. */
export function docBaselineGraph(): ExecGraph {
  const now = Date.now();
  const n = (id: string, type: ExecGraph["nodes"][number]["type"], label: string, x: number, y: number, tool?: string) => ({
    id, type, label, tool, x, y, pageIds: [], count: 0,
    provenance: [{ source: "doc" as const, docId: "DOC-AP-2019" }],
  });
  const e = (from: string, to: string, prob: number, condition?: string, when?: Condition[]) => ({
    id: `${from}->${to}`, from, to, count: 0, prob, condition, when, experts: [], source: "doc" as const,
  });
  return {
    id: "G-AP",
    process: "Invoice processing (accounts payable)",
    version: 1,
    updatedAt: now,
    nodes: [
      n("start", "start", "Invoice in AP inbox", 0, 0),
      n("get_invoice", "action", "Open invoice", 0, 110, "get_invoice"),
      n("check_po", "human_check", "Check supplier & amount vs PO", 0, 220),
      n("set_invoice_coding", "action", "Assign cost center", 0, 330, "set_invoice_coding"),
      n("dec_amount", "decision", "Amount > €10,000?", 0, 440),
      n("request_approval", "action", "Request department-head approval", 260, 550, "request_approval"),
      n("post_invoice", "action", "Post invoice", 0, 660, "post_invoice"),
      n("end", "end", "Done", 0, 770),
    ],
    edges: [
      e("start", "get_invoice", 1),
      e("get_invoice", "check_po", 1),
      e("check_po", "set_invoice_coding", 1),
      e("set_invoice_coding", "dec_amount", 1),
      e("dec_amount", "request_approval", 0.2, "amount > €10,000", [{ field: "invoice.amount", op: "gt", value: 10000 }]),
      e("dec_amount", "post_invoice", 0.8, "amount ≤ €10,000", [{ field: "invoice.amount", op: "lte", value: 10000 }]),
      e("request_approval", "post_invoice", 1),
      e("post_invoice", "end", 1),
    ],
    groups: [],
    traces: [],
  };
}

export function seedDB(): DB {
  const now = Date.now();
  return {
    suppliers,
    costCenters: [
      { code: "4711", name: "Production maintenance", type: "opex" },
      { code: "4720", name: "Office & administration", type: "opex" },
      { code: "4800", name: "Logistics", type: "opex" },
      { code: "0400", name: "Machinery & equipment (capex)", type: "capex" },
      { code: "0410", name: "IT hardware (capex)", type: "capex" },
    ],
    invoices: structuredClone(invoices),
    people: [
      { id: "sabine", name: "Sabine Weber", role: "Accounts payable lead", years: 24, kind: "expert" },
      { id: "thomas", name: "Thomas Brandt", role: "AP accountant", years: 9, kind: "expert" },
      { id: "lena", name: "Lena Hoffmann", role: "AP accountant (new hire)", years: 0, kind: "learner" },
    ],
    docs: [
      { id: "DOC-AP-2019", title: "AP invoice processing v2.1 (2019)", kind: "process_doc", content: PROCESS_DOC_2019, source: "SharePoint/Finance/AP", createdAt: now },
    ],
    sessions: [],
    pages: [],
    graph: docBaselineGraph(),
    lessons: [],
    settings: { privacyBlur: true, questionBudgetPer10Min: 5, pauseMs: 1800 },
  };
}

/** Restores only the AP application data (invoices) — knowledge is kept. */
export function seedInvoices(): Invoice[] {
  return structuredClone(invoices);
}
