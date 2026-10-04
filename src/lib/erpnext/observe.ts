import "server-only";
import { gateTool, ingest, tutorReadiness, type GateResult, type IngestResult, type RawMsg } from "../capture";
import { hasLLM, llmJSON } from "../llm";
import { db, mutate } from "../store";
import type { DB, Invoice, ScreenState, Session } from "../types";
import { describeChange, type FieldChange } from "./diff";
import { refreshInvoice, resolveInvoice } from "./mirror";
import { refOfTitle } from "./model";

// Capture on a real application that asky cannot instrument. Every shared
// frame goes to a vision model, which reads the screen into a small structured
// state (which invoice, which cost center, hold box, status, dialog in front).
// Consecutive states are diffed into domain steps — the same tool vocabulary
// the knowledge hub uses — and each committed change is confirmed against the
// application's API, so a misread pixel never becomes "knowledge".

const SYSTEM = `You watch an accounts-payable clerk's shared screen while they work in ERPNext (Purchase Invoices).
Read only what is visible. Return:
- view: "invoice_form" (one Purchase Invoice open), "invoice_list" (list of purchase invoices), "supplier_history" (a list of purchase invoices filtered to ONE supplier — a "Supplier" filter is set, or every row shows the same supplier), "dialog" (a modal/confirm dialog in front of an invoice), "other".
- invoiceRef: the leading number of the invoice title in the form header, e.g. "4471" from "4471 · Fräswerk Ulm GmbH" (or the ACC-PINV-… name if no number is shown).
- costCenter: the number at the start of the Cost Center field, e.g. "4711" from "4711 - Production maintenance - KM".
- assetNumber: value of the Asset Number field, if filled.
- onHold: whether the "Hold Invoice" checkbox is ticked.
- status: the status indicator next to the title (e.g. Draft, Not Saved, On Hold, Pending Approval, Approved, Posted, Unpaid, Overdue).
- unsaved: true if the form shows "Not Saved".
- dialog: REQUIRED when a dialog is in front — copy its message verbatim (e.g. "Are you sure you want to Post?", "Are you sure you want to Request Approval?"); omit otherwise.
- supplier: the supplier the list is filtered to, on list/history views.
- comment: the newest comment text in the form timeline, if visible.
- section: the form tab or section in view (e.g. "Details", "Taxes and Charges", "Accounting Dimensions", "Items", "Payments").
- activity: what the clerk changed or is editing compared with the previous screen state, naming the field (or table) by its label and the value, e.g. "added a row in Purchase Taxes and Charges: Abziehbare Vorsteuer 19 %", "typed PROJ-0001 into Project", "opened the Actions menu". Omit if nothing changed.
- caption: one short sentence of what the clerk is doing.
Never transcribe IBANs, e-mail addresses or phone numbers. Omit fields you cannot read with confidence.`;

const SCHEMA = {
  type: "object",
  properties: {
    app: { type: "string" },
    view: { type: "string", enum: ["invoice_form", "invoice_list", "supplier_history", "dialog", "other"] },
    invoiceRef: { type: "string" },
    costCenter: { type: "string" },
    assetNumber: { type: "string" },
    onHold: { type: "boolean" },
    status: { type: "string" },
    unsaved: { type: "boolean" },
    dialog: { type: "string" },
    supplier: { type: "string" },
    comment: { type: "string" },
    section: { type: "string" },
    activity: { type: "string" },
    caption: { type: "string" },
  },
  required: ["app", "view", "caption"],
};

export async function readScreen(dataUrl: string, prev?: ScreenState): Promise<ScreenState | null> {
  if (!hasLLM()) return null;
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png));base64,(.+)$/);
  if (!m) return null;
  try {
    const st = await llmJSON<Omit<ScreenState, "ts">>({
      model: "fast",
      maxTokens: 500,
      system: SYSTEM,
      prompt: `Previous screen state: ${prev ? JSON.stringify({ ...prev, ts: undefined }) : "(none)"}`,
      images: [{ mediaType: m[1] as "image/jpeg" | "image/png", data: m[2] }],
      schema: SCHEMA,
      name: "screen_state",
    });
    // a dialog is in front but its text was not read: ask once more, only for that (it decides whether to hold)
    if (st.view === "dialog" && !st.dialog) st.dialog = await readDialog(m[1] as "image/jpeg" | "image/png", m[2]);
    return { ...st, invoiceRef: st.invoiceRef?.replace(/^#/, "").trim() || undefined, costCenter: st.costCenter?.match(/\d{3,5}/)?.[0] ?? st.costCenter, ts: Date.now() };
  } catch (e) {
    console.warn("[vision:erpnext]", (e as Error).message);
    return null;
  }
}

async function readDialog(mediaType: "image/jpeg" | "image/png", data: string): Promise<string | undefined> {
  const r = await llmJSON<{ text: string }>({
    model: "fast",
    maxTokens: 120,
    system: "A modal dialog is open on this screen. Copy the dialog's message text verbatim (not the buttons). If there is no dialog, return an empty string.",
    prompt: "Dialog text?",
    images: [{ mediaType, data }],
    schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    name: "dialog_text",
  }).catch(() => null);
  return r?.text?.trim() || undefined;
}

const eur = (n: number) => `€${n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const label = (i: Invoice) => refOfTitle(i.title) ?? i.id;

/** Domain steps between two mirrored versions of the same invoice (values from the API, not the pixels). */
function changes(before: Invoice, after: Invoice, ts: number, frameId?: string, comment?: string): RawMsg[] {
  const out: RawMsg[] = [];
  const obs = (tool: string, args: Record<string, unknown>, summary: string): RawMsg => ({ type: "asky:observed", tool, args: { id: after.id, ...args }, summary, caseId: after.id, ts, frameId });
  const n = label(after);
  if (before.costCenter !== after.costCenter || before.assetNumber !== after.assetNumber) {
    const changed = { from: before.costCenter, to: after.costCenter };
    out.push(obs("set_invoice_coding", { costCenter: after.costCenter, assetNumber: after.assetNumber, __changed: changed },
      `invoice ${n}: cost center ${changed.from !== changed.to ? `${changed.from} → ${changed.to}` : `kept ${after.costCenter}`}${after.assetNumber ? `, asset ${after.assetNumber}` : ""}`));
  }
  const reason = after.holdReason ?? comment; // ERPNext: the reason is the comment written just before
  if (before.status !== "on_hold" && after.status === "on_hold") out.push(obs("hold_invoice", { reason: reason ?? "" }, `put invoice ${n} on hold${reason ? `: "${reason}"` : ""}`));
  if (before.status === "on_hold" && after.status !== "on_hold" && after.status !== "posted") out.push(obs("release_invoice", {}, `released invoice ${n} from hold`));
  if (!before.approvals.length && after.approvals.length) out.push(obs("request_approval", { approver: "Controlling", role: "controller" }, `sent invoice ${n} to the controller for approval`));
  if (before.status !== "posted" && after.status === "posted") out.push(obs("post_invoice", {}, `posted invoice ${n}`));
  return out;
}

export interface ObserveResult extends Partial<IngestResult> {
  screen: ScreenState | null;
  /** capture: the expert is about to confirm an irreversible step — ask first */
  hold?: GateResult["hold"];
  /** teach: the learner is about to break a guardrail — the tutor steps in before "Yes" ("confirm"),
   *  right after a save that left the invoice unpostable ("saved"), or when they leave it like that ("left") */
  block?: Pick<GateResult, "tool" | "violations" | "message"> & { stage?: "confirm" | "saved" | "left"; invoice?: string };
}

export async function observeFrame(sessionId: string, dataUrl: string, ts: number, frameId?: string): Promise<ObserveResult> {
  const d = db();
  const s = d.sessions.find((x) => x.id === sessionId);
  if (!s) throw new Error("session not found");
  const prev = s.screen;
  const st = await readScreen(dataUrl, prev);
  if (!st) return { screen: null };
  mutate((x) => {
    const ss = x.sessions.find((y) => y.id === sessionId);
    if (ss) ss.screen = st;
  });

  const msgs: RawMsg[] = [];
  const obs = (tool: string, args: Record<string, unknown>, summary: string, caseId?: string): RawMsg => ({ type: "asky:observed", tool, args, summary, caseId, ts, frameId });
  const inv = resolveInvoice(d, st.invoiceRef);
  const prevInv = resolveInvoice(d, prev?.invoiceRef);
  const onInvoice = st.view === "invoice_form" || st.view === "dialog";

  if (inv && onInvoice && (inv.id !== prevInv?.id || (prev && prev.view !== "invoice_form" && prev.view !== "dialog"))) {
    if (!lastOpened(s, inv.id)) {
      const sup = d.erp?.suppliers.find((x) => x.id === inv.supplierId);
      msgs.push(obs("get_invoice", { id: inv.id }, `opened invoice ${label(inv)} — ${sup?.name ?? inv.supplierId}, ${eur(inv.amount)}, ${inv.description}`, inv.id));
    }
  }
  const history = (x?: ScreenState) => (x?.view === "supplier_history" || (x?.view === "invoice_list" && !!x.supplier) ? x.supplier : undefined);
  if (history(st) && history(st) !== history(prev)) {
    const sup = d.erp?.suppliers.find((x) => x.name === st.supplier || x.id === st.supplier || st.supplier!.startsWith(x.name.slice(0, 12)));
    if (sup) msgs.push(obs("get_supplier_history", { id: sup.id }, `checked invoice history of supplier ${sup.name}`));
  }
  // a saved form (or a status change) → confirm what was committed against the API
  if (inv && st.view === "invoice_form" && !st.unsaved) {
    const r = await refreshInvoice(d, inv.id).catch(() => null);
    if (r) msgs.push(...changes(inv, r.invoice, ts, frameId, st.comment ?? prev?.comment));
    // everything else on the form (taxes, project, items, dates…), values from the API, named by the harness tool
    // that owns the field (one step per form section or table) — the same names the domain MCP exposes
    const steps = new Map<string, FieldChange[]>();
    for (const c of r?.diff?.changes ?? []) {
      const tool = harnessToolFor(d, c.field) ?? `set_invoice_${c.field}`;
      steps.set(tool, [...(steps.get(tool) ?? []), c]);
    }
    for (const [tool, cs] of steps) {
      const total = r?.diff?.total && cs.some((c) => /^(taxes|items|taxes_and_charges)$/.test(c.field)) ? `; total ${r.diff.total.from} → ${r.diff.total.to}` : "";
      msgs.push(obs(tool, { id: inv.id, changes: cs }, `invoice ${label(inv)}: ${cs.map(describeChange).join("; ")}${total}`, inv.id));
    }
  }
  if (inv && st.comment && !s.events.some((e) => e.tool === "add_invoice_note" && e.caseId === inv.id && e.args?.text === st.comment)) {
    msgs.push(obs("add_invoice_note", { id: inv.id, text: st.comment }, `note on invoice ${label(inv)}: "${st.comment}"`, inv.id));
  }

  const r = msgs.length ? await ingest(sessionId, msgs) : { events: [], questions: [], recognized: [] };

  // a confirm dialog for an irreversible step is on screen: nothing is saved until "Yes"
  let hold: GateResult["hold"];
  let block: ObserveResult["block"];
  if (inv && st.dialog && /\b(post|submit)\b/i.test(st.dialog) && !(prev?.dialog && prev.invoiceRef === st.invoiceRef)) {
    const g = gateTool(sessionId, "post_invoice", { id: inv.id });
    hold = g.hold;
    if (!g.allow && !g.hold && g.violations?.length) block = { tool: g.tool, violations: g.violations, message: g.message, stage: "confirm", invoice: label(inv) };
  }
  // teach: a save cannot be stopped in a real app — say it right after, and again when they walk away from it
  if (s.mode === "teach" && !block) {
    const saved = inv && r.events.some((e) => e.caseId === inv.id && e.kind === "tool" && e.tool !== "get_invoice" && e.effect !== "read");
    const left = prevInv && prevInv.id !== inv?.id && (onInvoice || st.view === "invoice_list") ? prevInv : undefined;
    const v = (saved && tutorReadiness(sessionId, inv.id, "saved")) || (left && tutorReadiness(sessionId, left.id, "left", onInvoice ? "all" : "data"));
    const which = v && (saved ? inv : left);
    if (v && which) block = { tool: "post_invoice", violations: [v], stage: saved ? "saved" : "left", invoice: label(which) };
  }
  return { screen: st, ...r, hold, block };
}

function lastOpened(s: Session, caseId: string) {
  const last = [...s.events].reverse().find((e) => e.tool === "get_invoice");
  return last?.caseId === caseId;
}

/** The harness tool for a Purchase Invoice field: the section tool listing it, or the tool of the child table itself. */
function harnessToolFor(d: DB, field: string): string | undefined {
  const tools = d.catalogs?.erpnext?.tools.filter((t) => t.method === "PUT" && t.pathTemplate.includes("/Purchase Invoice/")) ?? [];
  return (tools.find((t) => t.params.some((p) => p.in === "body" && p.name === field)) ?? tools.find((t) => t.pathTemplate.endsWith(`#${field}`)))?.name;
}
