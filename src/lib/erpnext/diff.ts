import "server-only";
import { erp, erpDoc } from "./client";
import { ASSET_FIELD } from "./model";

// Whatever the clerk changed on a saved Purchase Invoice, read from ERPNext
// itself: the full document before and after, compared field by field (child
// tables row by row) and labelled with ERPNext's own form metadata. Vision only
// has to notice *that* a form was saved; the API says exactly *what* changed.

type Row = Record<string, unknown>;
interface Field { fieldname: string; label?: string; fieldtype: string; options?: string; read_only?: number; hidden?: number }
type Meta = Map<string, Map<string, Field>>; // doctype → fieldname → field

const LAYOUT = new Set(["Section Break", "Column Break", "Tab Break", "HTML", "Button", "Heading", "Fold", "Image"]);
// covered by the dedicated steps (set_invoice_coding, hold/approve/post) or bookkeeping noise
const COVERED = new Set(["cost_center", ASSET_FIELD, "workflow_state", "status", "docstatus", "on_hold", "hold_comment", "release_date", "title", "payment_schedule"]);
const SYSTEM = new Set(["name", "owner", "creation", "modified", "modified_by", "idx", "parent", "parentfield", "parenttype", "doctype", "naming_series", "amended_from"]);
// how a child row is named in a sentence, in order of preference
const ROW_NAME = ["description", "account_head", "item_name", "item_code", "payment_term", "reference_name"];
const ROW_AMOUNT = ["tax_amount", "amount", "payment_amount", "allocated_amount"];

const g = globalThis as unknown as { __erpMeta?: Promise<Meta>; __erpDocs?: Map<string, Row> };
/** last full document seen per invoice — the "before" of the next save */
const docs = (g.__erpDocs ??= new Map());

function meta(): Promise<Meta> {
  g.__erpMeta ??= erp<{ docs: { name: string; fields: Field[] }[] }>("GET", `/api/method/frappe.desk.form.load.getdoctype?doctype=${encodeURIComponent("Purchase Invoice")}`)
    .then((r) => new Map(r.docs.map((d) => [d.name, new Map(d.fields.map((f) => [f.fieldname, f]))])))
    .catch((e) => {
      g.__erpMeta = undefined;
      throw e;
    });
  return g.__erpMeta;
}

export function rememberDoc(doc: Row) {
  docs.set(String(doc.name), doc);
}

export interface FieldChange {
  field: string;
  label: string;
  /** a header field: from → to; a table: rows added / removed / edited */
  from?: string;
  to?: string;
  added?: string[];
  removed?: string[];
  edited?: string[];
}

const blank = (v: unknown) => v == null || v === "" || v === 0 || (Array.isArray(v) && !v.length);
const fmt = (v: unknown, f?: Field) =>
  v == null || v === "" ? "—" : f?.fieldtype === "Currency" ? `€${Number(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : f?.fieldtype === "Check" ? (v ? "yes" : "no") : String(v);
const same = (a: unknown, b: unknown) => (blank(a) && blank(b)) || String(a ?? "") === String(b ?? "");
/** fields a person edits: not layout, not computed (read-only), not bookkeeping */
const editable = (f: Field) => !LAYOUT.has(f.fieldtype) && !f.read_only && !SYSTEM.has(f.fieldname) && !COVERED.has(f.fieldname) && !f.fieldname.startsWith("base_");

function rowLabel(r: Row, fields: Map<string, Field>) {
  const name = String(ROW_NAME.map((k) => r[k]).find((v) => !blank(v)) ?? `row ${r.idx}`).trim();
  const rate = r.charge_type && !blank(r.rate) && !name.includes(String(r.rate)) ? ` ${r.rate} %` : ""; // tax rows
  const amt = ROW_AMOUNT.find((k) => !blank(r[k]));
  return `"${name}"${rate}${amt ? ` ${fmt(r[amt], fields.get(amt))}` : ""}`;
}

/** rows matched by their ERPNext name; `skip`: fields already reported on the header (a project set on the invoice and copied to its items) */
function diffTable(before: Row[], after: Row[], fields: Map<string, Field>, skip: Set<string>): Pick<FieldChange, "added" | "removed" | "edited"> | null {
  const old = new Map(before.map((r) => [String(r.name), r]));
  const now = new Set(after.map((r) => String(r.name)));
  const added = after.filter((r) => !old.has(String(r.name))).map((r) => rowLabel(r, fields));
  const removed = before.filter((r) => !now.has(String(r.name))).map((r) => rowLabel(r, fields));
  const edited: string[] = [];
  for (const r of after) {
    const o = old.get(String(r.name));
    if (!o) continue;
    const ch = [...fields.values()].filter((f) => editable(f) && !skip.has(f.fieldname) && !same(o[f.fieldname], r[f.fieldname])).map((f) => `${f.label ?? f.fieldname} ${fmt(o[f.fieldname], f)} → ${fmt(r[f.fieldname], f)}`);
    if (ch.length) edited.push(`${rowLabel(r, fields)}: ${ch.join(", ")}`);
  }
  return added.length || removed.length || edited.length ? { added, removed, edited } : null;
}

/** What changed on this invoice since asky last read it (null: first read, or nothing new). */
export async function diffDoc(after: Row): Promise<{ changes: FieldChange[]; total?: { from: string; to: string } } | null> {
  const before = docs.get(String(after.name));
  rememberDoc(after);
  if (!before || before.modified === after.modified) return null;
  const m = await meta();
  const head = m.get("Purchase Invoice");
  if (!head) return null;
  const fields = [...head.values()].filter((f) => editable(f) && !f.hidden);
  const isTable = (f: Field) => f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect";
  const changes: FieldChange[] = fields
    .filter((f) => !isTable(f) && !same(before[f.fieldname], after[f.fieldname]))
    .map((f) => ({ field: f.fieldname, label: f.label ?? f.fieldname, from: fmt(before[f.fieldname], f), to: fmt(after[f.fieldname], f) }));
  const onHeader = new Set(changes.map((c) => c.field));
  for (const f of fields.filter(isTable)) {
    const t = diffTable((before[f.fieldname] as Row[]) ?? [], (after[f.fieldname] as Row[]) ?? [], m.get(f.options ?? "") ?? new Map(), onHeader);
    if (t) changes.push({ field: f.fieldname, label: f.label ?? f.fieldname, ...t });
  }
  if (!changes.length) return null;
  // a project is shown by its name, not "PROJ-0001"
  for (const c of changes) {
    if (c.field === "project" && c.to && c.to !== "—") {
      const p = await erpDoc.get<{ project_name?: string }>("Project", c.to).catch(() => null);
      if (p?.project_name && p.project_name !== c.to) c.to = `${c.to} (${p.project_name})`;
    }
  }
  const total = same(before.grand_total, after.grand_total) ? undefined : { from: fmt(before.grand_total, head.get("grand_total")), to: fmt(after.grand_total, head.get("grand_total")) };
  return { changes, total };
}

/** "Purchase Taxes and Charges: added "Abziehbare Vorsteuer 19 %" €244,06" */
export function describeChange(c: FieldChange) {
  if (c.from !== undefined) return `${c.label} ${c.from === "—" ? `set to ${c.to}` : `${c.from} → ${c.to}`}`;
  const parts = [c.added?.length && `added ${c.added.join(", ")}`, c.removed?.length && `removed ${c.removed.join(", ")}`, c.edited?.length && `changed ${c.edited.join("; ")}`].filter(Boolean);
  return `${c.label}: ${parts.join("; ")}`;
}
