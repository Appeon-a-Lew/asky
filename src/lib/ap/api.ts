import "server-only";
import { z } from "zod";
import { db, mutate } from "../store";
import { seedInvoices } from "../seed";
import type { Approval, Invoice } from "../types";

// REST API of the mock AP application ("Ledgerline AP").
// It knows nothing about the apprentice — the harness discovers it from the
// outside via /api/ap/openapi.json + a UI crawl, like it would for any app.

type Params = Record<string, string>;
type Handler = (p: Params, body: unknown, query: URLSearchParams) => { status?: number; json: unknown };

interface Route {
  method: "GET" | "POST" | "PATCH";
  path: string; // /invoices/{id}
  operationId: string;
  summary: string;
  description?: string;
  body?: z.ZodObject<z.ZodRawShape>;
  query?: Record<string, string>;
  handler: Handler;
}

const err = (status: number, message: string) => ({ status, json: { error: message } });

function findInvoice(id: string): Invoice | undefined {
  return db().invoices.find((i) => i.id === id);
}

function withSupplier(i: Invoice) {
  const d = db();
  return {
    ...i,
    supplier: d.suppliers.find((s) => s.id === i.supplierId),
    costCenterInfo: d.costCenters.find((c) => c.code === i.costCenter),
  };
}

const ACTOR = "AP user";

export const routes: Route[] = [
  {
    method: "GET", path: "/invoices", operationId: "listInvoices",
    summary: "List invoices in the AP inbox",
    query: { status: "Filter by status (open, on_hold, awaiting_approval, approved, posted)", training: "Include training cases (true/false)" },
    handler: (_p, _b, q) => {
      const status = q.get("status");
      const training = q.get("training") === "true";
      const list = db().invoices
        .filter((i) => (training ? i.training : !i.training))
        .filter((i) => !status || i.status === status)
        .map(withSupplier);
      return { json: list };
    },
  },
  {
    method: "GET", path: "/invoices/{id}", operationId: "getInvoice",
    summary: "Open an invoice and show its details",
    handler: (p) => {
      const i = findInvoice(p.id);
      return i ? { json: withSupplier(i) } : err(404, "invoice not found");
    },
  },
  {
    method: "GET", path: "/suppliers/{id}/invoices", operationId: "getSupplierHistory",
    summary: "Show the invoice history of a supplier (used to spot duplicates)",
    handler: (p) => {
      const d = db();
      const s = d.suppliers.find((x) => x.id === p.id);
      if (!s) return err(404, "supplier not found");
      return { json: { supplier: s, invoices: d.invoices.filter((i) => i.supplierId === p.id && !i.training).sort((a, b) => b.date.localeCompare(a.date)) } };
    },
  },
  {
    method: "GET", path: "/cost-centers", operationId: "listCostCenters",
    summary: "List cost centers",
    handler: () => ({ json: db().costCenters }),
  },
  {
    method: "PATCH", path: "/invoices/{id}/coding", operationId: "setInvoiceCoding",
    summary: "Change the cost center (and asset number) an invoice is booked to",
    body: z.object({ costCenter: z.string(), assetNumber: z.string().optional() }),
    handler: (p, body) => {
      const b = body as { costCenter: string; assetNumber?: string };
      return mutate((d) => {
        const i = d.invoices.find((x) => x.id === p.id);
        if (!i) return err(404, "invoice not found");
        if (i.status === "posted") return err(409, "invoice already posted");
        if (!d.costCenters.some((c) => c.code === b.costCenter)) return err(422, `unknown cost center ${b.costCenter}`);
        const from = i.costCenter;
        i.costCenter = b.costCenter;
        if (b.assetNumber !== undefined) i.assetNumber = b.assetNumber || undefined;
        return { json: { ...withSupplier(i), changed: { from, to: b.costCenter } } };
      });
    },
  },
  {
    method: "POST", path: "/invoices/{id}/hold", operationId: "holdInvoice",
    summary: "Put an invoice on hold so it is not paid",
    body: z.object({ reason: z.string() }),
    handler: (p, body) => mutate((d) => {
      const i = d.invoices.find((x) => x.id === p.id);
      if (!i) return err(404, "invoice not found");
      if (i.status === "posted") return err(409, "invoice already posted");
      i.status = "on_hold";
      i.holdReason = (body as { reason: string }).reason;
      return { json: withSupplier(i) };
    }),
  },
  {
    method: "POST", path: "/invoices/{id}/release", operationId: "releaseInvoice",
    summary: "Release an invoice from hold",
    handler: (p) => mutate((d) => {
      const i = d.invoices.find((x) => x.id === p.id);
      if (!i) return err(404, "invoice not found");
      i.status = "open";
      i.holdReason = undefined;
      return { json: withSupplier(i) };
    }),
  },
  {
    method: "POST", path: "/invoices/{id}/approval-requests", operationId: "requestApproval",
    summary: "Send the invoice to someone for approval",
    body: z.object({ approver: z.string(), role: z.enum(["department_head", "controller", "cfo"]), reason: z.string().optional() }),
    handler: (p, body) => mutate((d) => {
      const i = d.invoices.find((x) => x.id === p.id);
      if (!i) return err(404, "invoice not found");
      if (i.status === "posted") return err(409, "invoice already posted");
      const b = body as Approval;
      i.approvals.push({ approver: b.approver, role: b.role, reason: b.reason, requestedAt: new Date().toISOString() });
      i.status = "awaiting_approval";
      return { json: withSupplier(i) };
    }),
  },
  {
    method: "POST", path: "/invoices/{id}/approve", operationId: "approveInvoice",
    summary: "Record an approval for an invoice (approver role)",
    body: z.object({ approver: z.string() }),
    handler: (p, body) => mutate((d) => {
      const i = d.invoices.find((x) => x.id === p.id);
      if (!i) return err(404, "invoice not found");
      const a = i.approvals.find((x) => x.approver === (body as { approver: string }).approver && !x.approvedAt);
      if (!a) return err(409, "no open approval request for this approver");
      a.approvedAt = new Date().toISOString();
      if (i.approvals.every((x) => x.approvedAt)) i.status = "approved";
      return { json: withSupplier(i) };
    }),
  },
  {
    method: "POST", path: "/invoices/{id}/notes", operationId: "addInvoiceNote",
    summary: "Add an internal note to an invoice",
    body: z.object({ text: z.string() }),
    handler: (p, body) => mutate((d) => {
      const i = d.invoices.find((x) => x.id === p.id);
      if (!i) return err(404, "invoice not found");
      i.notes.push({ at: new Date().toISOString(), by: ACTOR, text: (body as { text: string }).text });
      return { json: withSupplier(i) };
    }),
  },
  {
    method: "POST", path: "/invoices/{id}/post", operationId: "postInvoice",
    summary: "Post the invoice to the ledger and release it for the payment run. Cannot be undone.",
    handler: (p) => mutate((d) => {
      const i = d.invoices.find((x) => x.id === p.id);
      if (!i) return err(404, "invoice not found");
      if (i.status === "posted") return err(409, "invoice already posted");
      if (i.status === "on_hold") return err(409, "invoice is on hold");
      if (i.status === "awaiting_approval") return err(409, "approval still pending");
      i.status = "posted";
      i.postedAt = new Date().toISOString();
      return { json: withSupplier(i) };
    }),
  },
  {
    method: "POST", path: "/sandbox/reset", operationId: "resetSandbox",
    summary: "Reset sandbox data (admin)",
    handler: () => mutate((d) => {
      d.invoices = seedInvoices();
      return { json: { ok: true } };
    }),
  },
];

function match(template: string, actual: string): Params | null {
  const t = template.split("/").filter(Boolean);
  const a = actual.split("/").filter(Boolean);
  if (t.length !== a.length) return null;
  const params: Params = {};
  for (let k = 0; k < t.length; k++) {
    const m = t[k].match(/^\{(\w+)\}$/);
    if (m) params[m[1]] = decodeURIComponent(a[k]);
    else if (t[k] !== a[k]) return null;
  }
  return params;
}

export function dispatch(method: string, subpath: string, body: unknown, query: URLSearchParams) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const p = match(r.path, subpath);
    if (!p) continue;
    if (r.body) {
      const parsed = r.body.safeParse(body ?? {});
      if (!parsed.success) return err(422, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      return r.handler(p, parsed.data, query);
    }
    return r.handler(p, body, query);
  }
  return err(404, `no route ${method} ${subpath}`);
}

/** OpenAPI 3.1 description generated from the route table. */
export function openapi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of routes) {
    const pathParams = [...r.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    const queryParams = Object.entries(r.query ?? {}).map(([name, description]) => ({ name, in: "query", required: false, description, schema: { type: "string" } }));
    const op: Record<string, unknown> = {
      operationId: r.operationId,
      summary: r.summary,
      parameters: [...pathParams, ...queryParams],
      responses: { "200": { description: "OK" } },
    };
    if (r.body) op.requestBody = { required: true, content: { "application/json": { schema: z.toJSONSchema(r.body) } } };
    (paths[`/api/ap${r.path}`] ??= {})[r.method.toLowerCase()] = op;
  }
  return {
    openapi: "3.1.0",
    info: { title: "Ledgerline AP", version: "1.0.0", description: "Accounts payable invoice processing" },
    paths,
  };
}
