import type { CrawlObservation, OpenAPISpec } from "../src/lib/mcp/generate";

// Frappe / ERPNext adapter for the harness. Frappe has no OpenAPI document, but
// it describes itself completely: every DocType's form layout (sections and
// fields), whether a document is submittable (posting is permanent), and the
// active workflow (named transitions between states). That metadata becomes
// an OpenAPI-shaped spec so the normal catalog generator can run on it.
//
// One REST endpoint serves many business steps (PUT /api/resource/<DocType>
// changes any field; apply_workflow runs any transition), so operations are
// told apart by a URL fragment: PUT /api/resource/Purchase Invoice/{name}#hold_invoice.
// Fragments are never sent over the wire, so buildRequest() still works.

type Field = { fieldname: string; fieldtype: string; label?: string; hidden?: number; read_only?: number; reqd?: number; options?: string; description?: string; in_list_view?: number };
type DocTypeMeta = { name: string; is_submittable?: number; title_field?: string; fields: Field[] };
type Workflow = { name: string; is_active: number; enable_action_confirmation?: number; states: { state: string; doc_status: string }[]; transitions: { state: string; action: string; next_state: string; allowed: string }[] };

const EDITABLE = new Set(["Data", "Link", "Check", "Date", "Datetime", "Currency", "Float", "Int", "Percent", "Select", "Small Text", "Text", "Text Editor", "Long Text"]);
const LAYOUT = new Set(["Section Break", "Tab Break"]);
const MAX_SECTION_FIELDS = 10; // bigger sections are setup screens, not single business steps

export const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();

export async function frappeLogin(baseUrl: string, usr: string, pwd: string): Promise<string> {
  const r = await fetch(new URL("/api/method/login", baseUrl), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usr, pwd }) });
  if (!r.ok) throw new Error(`login failed: HTTP ${r.status}`);
  return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function get<T>(baseUrl: string, cookie: string, path: string): Promise<T> {
  const r = await fetch(new URL(path, baseUrl), { headers: { cookie, accept: "application/json" } });
  if (!r.ok) throw new Error(`GET ${path}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** Form sections with the editable business fields in each. */
function sections(meta: DocTypeMeta) {
  const out: { key: string; label: string; fields: Field[] }[] = [];
  let cur = { key: "main", label: `${meta.name} details`, fields: [] as Field[] };
  for (const f of meta.fields) {
    if (LAYOUT.has(f.fieldtype)) {
      if (cur.fields.length) out.push(cur);
      cur = { key: f.fieldname, label: f.label || cur.label, fields: [] };
      continue;
    }
    if (EDITABLE.has(f.fieldtype) && !f.hidden && !f.read_only && f.label && f.fieldname !== "naming_series" && f.fieldname !== "workflow_state") cur.fields.push(f);
  }
  if (cur.fields.length) out.push(cur);
  return out.filter((s) => s.fields.length <= MAX_SECTION_FIELDS);
}

/** Child tables a person edits row by row (Items, Purchase Taxes and Charges…), with the columns of each row. */
function tables(meta: DocTypeMeta, docs: DocTypeMeta[]) {
  return meta.fields
    .filter((f) => (f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect") && !f.hidden && !f.read_only && f.label)
    .map((f) => {
      const child = docs.find((x) => x.name === f.options);
      const cols = (child?.fields ?? []).filter((c) => EDITABLE.has(c.fieldtype) && !c.hidden && !c.read_only && c.label);
      const shown = cols.filter((c) => c.in_list_view);
      return { field: f, columns: (shown.length ? shown : cols).slice(0, 8) };
    });
}

const ptype = (t: string) => (["Check", "Int"].includes(t) ? "integer" : ["Currency", "Float", "Percent"].includes(t) ? "number" : "string");

export interface FrappeDiscovery {
  spec: OpenAPISpec;
  doctypes: { name: string; submittable: boolean; sections: string[]; workflow?: { name: string; transitions: string[] } }[];
}

export async function discoverFrappe(baseUrl: string, cookie: string, doctypes: string[]): Promise<FrappeDiscovery> {
  const spec: OpenAPISpec = { info: { title: "Frappe (from DocType metadata)" }, paths: {} };
  const report: FrappeDiscovery["doctypes"] = [];
  const op = (path: string, method: string, o: Record<string, unknown>) => {
    (spec.paths[path] ??= {})[method] = o;
  };

  for (const dt of doctypes) {
    const { docs } = await get<{ docs: DocTypeMeta[] }>(baseUrl, cookie, `/api/method/frappe.desk.form.load.getdoctype?doctype=${encodeURIComponent(dt)}`);
    const meta = docs.find((x) => x.name === dt)!;
    const d = snake(dt);
    const res = `/api/resource/${dt}`;
    const links = meta.fields.filter((f) => f.fieldtype === "Link" && !f.hidden).map((f) => f.label).slice(0, 6);

    op(res, "get", { operationId: `list_${d}s`, summary: `List ${dt} records`, description: `Filterable by any field, e.g. ${links.join(", ")}.`, parameters: [{ name: "filters", in: "query", schema: { type: "string" }, description: 'JSON, e.g. [["supplier","=","…"]]' }] });
    op(`${res}/{name}`, "get", { operationId: `get_${d}`, summary: `Open one ${dt}`, parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }] });

    const secs = sections(meta);
    for (const s of secs) {
      op(`${res}/{name}#${s.key}`, "put", {
        operationId: `update_${d}_${snake(s.label)}`,
        summary: `Change "${s.label}" on a ${dt}: ${s.fields.map((f) => f.label).join(", ")}`,
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { content: { "application/json": { schema: { properties: Object.fromEntries(s.fields.map((f) => [f.fieldname, { type: ptype(f.fieldtype), description: [f.label, f.fieldtype === "Link" ? `→ ${f.options}` : "", f.description].filter(Boolean).join(" · ") }])) } } } },
      });
    }

    // a section holding only a table has no editable scalar fields, so it gets no section tool: the table gets its own
    const taken = (id: string) => Object.values(spec.paths).some((m) => Object.values(m).some((o) => o.operationId === id));
    for (const { field: f, columns } of tables(meta, docs)) {
      const base = `update_${d}_${snake(f.label!)}`;
      op(`${res}/{name}#${f.fieldname}`, "put", {
        operationId: taken(base) ? `${base}_rows` : base,
        summary: `Add, change or remove rows in the "${f.label}" table of a ${dt}${columns.length ? ` (columns: ${columns.map((c) => c.label).join(", ")})` : ""}`,
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { content: { "application/json": { schema: { properties: { [f.fieldname]: { type: "array", description: `all rows of ${f.label} → ${f.options}; each row: ${columns.map((c) => `${c.fieldname} (${c.label})`).join(", ")}` } } } } } },
      });
    }

    if (meta.is_submittable) {
      op(`/api/method/frappe.client.submit#${dt}`, "post", { operationId: `submit_${d}`, summary: `Permanently submit a ${dt} (it can no longer be edited; ledger entries are posted). Cannot be undone, only cancelled.`, requestBody: { content: { "application/json": { schema: { properties: { doc: { type: "string", description: `the ${dt} document` } }, required: ["doc"] } } } } });
      op(`/api/method/frappe.client.cancel#${dt}`, "post", { operationId: `cancel_${d}`, summary: `Cancel a submitted ${dt} (reverses its ledger entries; permanent)`, requestBody: { content: { "application/json": { schema: { properties: { doctype: { type: "string" }, name: { type: "string" } }, required: ["doctype", "name"] } } } } });
    }

    const comment = `/api/method/frappe.desk.form.utils.add_comment#${dt}`;
    op(comment, "post", { operationId: `add_comment_to_${d}`, summary: `Add a comment to a ${dt} (visible in its timeline)`, requestBody: { content: { "application/json": { schema: { properties: { reference_name: { type: "string" }, content: { type: "string" } }, required: ["reference_name", "content"] } } } } });

    const wfs = await get<{ data: Workflow[] }>(baseUrl, cookie, `/api/resource/Workflow?filters=${encodeURIComponent(JSON.stringify([["document_type", "=", dt], ["is_active", "=", 1]]))}&fields=["name"]`);
    let wfReport: FrappeDiscovery["doctypes"][number]["workflow"];
    if (wfs.data[0]) {
      const wf = (await get<{ data: Workflow }>(baseUrl, cookie, `/api/resource/Workflow/${encodeURIComponent(wfs.data[0].name)}`)).data;
      const docstatus = new Map(wf.states.map((s) => [s.state, s.doc_status]));
      const byAction = new Map<string, Workflow["transitions"]>();
      for (const t of wf.transitions) byAction.set(t.action, [...(byAction.get(t.action) ?? []), t]);
      for (const [action, ts] of byAction) {
        const submits = ts.some((t) => docstatus.get(t.next_state) === "1");
        const cancels = ts.some((t) => docstatus.get(t.next_state) === "2");
        const opId = `${snake(action)}_${d}`;
        op(`/api/method/frappe.model.workflow.apply_workflow#${action}`, "post", {
          operationId: taken(opId) ? `workflow_${opId}` : opId,
          summary: `Workflow "${wf.name}": ${action} (${ts.map((t) => `${t.state} → ${t.next_state}`).join(", ")}; allowed for ${[...new Set(ts.map((t) => t.allowed))].join(", ")})${submits ? " — submits the document permanently" : cancels ? " — cancels the document permanently" : ""}`,
          requestBody: { content: { "application/json": { schema: { properties: { doc: { type: "string" }, action: { type: "string", enum: [action] } }, required: ["doc", "action"] } } } },
        });
      }
      wfReport = { name: wf.name, transitions: wf.transitions.map((t) => `${t.state} —${t.action}→ ${t.next_state}`) };
    }
    report.push({ name: dt, submittable: !!meta.is_submittable, sections: secs.map((s) => `${s.label} (${s.fields.length})`), workflow: wfReport });
  }
  return { spec, doctypes: report };
}

/** Frappe's desk sends every save/submit/workflow step to a few generic methods; put the business action in the fragment. */
export function normalizeFrappeObservation(o: CrawlObservation): CrawlObservation {
  const u = new URL(o.url);
  const body = (o.body && typeof o.body === "object" ? o.body : {}) as Record<string, string>;
  const doc = (() => {
    try {
      return typeof body.doc === "string" ? JSON.parse(body.doc) : body.doc;
    } catch {
      return undefined;
    }
  })() as { doctype?: string } | undefined;
  if (u.pathname.endsWith("frappe.model.workflow.apply_workflow") && body.action) u.hash = body.action;
  else if (u.pathname.endsWith("frappe.desk.form.save.savedocs") && body.action === "Submit") {
    u.pathname = "/api/method/frappe.client.submit";
    u.hash = doc?.doctype ?? "";
  } else if (u.pathname.endsWith("frappe.desk.form.utils.add_comment")) u.hash = body.reference_doctype ?? "";
  return { ...o, url: u.toString() };
}

/** Mutating Frappe calls the crawl must never let through (reads go via POST too, so a blanket rule would break the desk). */
export const FRAPPE_MUTATION = /\/api\/method\/[\w.]*(savedocs|submit|cancel|apply_workflow|add_comment|delete|insert|set_value|rename|amend|bulk_update|make_|create_)|\/api\/resource\//;
