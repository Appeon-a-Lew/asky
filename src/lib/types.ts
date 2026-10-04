// Core domain types for asky — the AI Apprentice.
// Two halves: the mock AP application (what experts work in) and the
// knowledge layer (sessions, claims, pages, execution graph, lessons).

// ---------------------------------------------------------------------------
// Mock accounts-payable application
// ---------------------------------------------------------------------------

export type CostCenterType = "opex" | "capex";

export interface CostCenter {
  code: string;
  name: string;
  type: CostCenterType;
}

export interface Supplier {
  id: string;
  name: string;
  country: string; // ISO-2
  vatId: string;
  iban: string; // PII-ish, blurred on screen capture
  contactEmail: string;
  isSubsidiary: boolean;
  createdAt: string;
}

export type InvoiceStatus =
  | "open"
  | "on_hold"
  | "awaiting_approval"
  | "approved"
  | "posted";

export interface InvoiceLine {
  description: string;
  qty: number;
  unitPrice: number;
  category: "material" | "service" | "equipment" | "office" | "logistics" | "intercompany";
}

export interface Approval {
  approver: string;
  role: "department_head" | "controller" | "cfo";
  requestedAt: string;
  reason?: string;
  approvedAt?: string;
}

export interface InvoiceNote {
  at: string;
  by: string;
  text: string;
}

export interface Invoice {
  id: string; // e.g. "4471"
  number: string; // supplier's invoice number
  supplierId: string;
  date: string; // ISO date
  dueDate: string;
  currency: "EUR" | "CZK";
  amount: number; // gross, in currency
  description: string;
  lines: InvoiceLine[];
  poNumber?: string;
  costCenter: string; // pre-coded by OCR/default, expert may recode
  assetNumber?: string;
  status: InvoiceStatus;
  holdReason?: string;
  approvals: Approval[];
  notes: InvoiceNote[];
  postedAt?: string;
  training?: boolean; // only visible in Teach mode
  title?: string; // what the app shows in its form header (ERPNext: "4471 · Fräswerk Ulm GmbH")
  source?: "erpnext"; // mirrored from a real application
  erpName?: string; // the application's own document name, e.g. ACC-PINV-2026-00004
}

// ---------------------------------------------------------------------------
// Generated domain MCP (output of the harness)
// ---------------------------------------------------------------------------

export type ToolEffect = "read" | "write" | "irreversible";

export interface ToolParam {
  name: string;
  in: "path" | "query" | "body";
  type: "string" | "number" | "boolean" | "array"; // array: rows of a child table (ERPNext taxes, items)
  required: boolean;
  description?: string;
  enum?: string[];
}

export interface ToolDef {
  name: string; // snake_case, e.g. set_cost_center
  title: string;
  description: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  pathTemplate: string; // /api/ap/invoices/{id}/coding
  params: ToolParam[];
  effect: ToolEffect;
  uiLabels: string[]; // buttons / forms that trigger it, from the crawl
  evidence: string[]; // why the harness believes this (openapi, crawl, confirm dialog …)
}

export interface ToolCatalog {
  app: string;
  baseUrl: string;
  generatedAt: string;
  generator: "llm" | "heuristic";
  tools: ToolDef[];
  /** for another app: which of its tools implement each step of the reference vocabulary (the mock app's catalog) */
  alignment?: ToolAlignment[];
}

export interface ToolAlignment {
  canonical: string; // reference tool, e.g. set_invoice_coding
  tools: string[]; // this app's tools that implement it, e.g. update_purchase_invoice_accounting_dimensions
  args?: Record<string, string>; // canonical arg → this app's field, e.g. costCenter → cost_center
  note?: string;
}

// ---------------------------------------------------------------------------
// Capture: events, frames, transcript
// ---------------------------------------------------------------------------

export type EventKind = "tool" | "ui" | "external" | "system";

export interface AppEvent {
  id: string;
  sessionId: string;
  ts: number; // ms since epoch
  kind: EventKind;
  tool?: string; // MCP tool name when kind === "tool"
  args?: Record<string, unknown>;
  effect?: ToolEffect;
  ok?: boolean; // API response ok
  error?: string;
  caseId?: string; // invoice id the event belongs to
  ui?: { action: "focus" | "input" | "click" | "nav"; field?: string; value?: string; label?: string };
  external?: { app: string; description: string }; // from the vision model
  frameId?: string;
  summary: string; // human-readable one-liner: "cost center changed 4711 → 0400"
}

export interface Frame {
  id: string;
  sessionId: string;
  ts: number;
  file: string; // relative path under data/frames
  caption?: string;
}

export type Speaker = "expert" | "agent" | "learner" | "system";

export interface Utterance {
  id: string;
  sessionId: string;
  ts: number;
  speaker: Speaker;
  text: string;
  questionId?: string;
  offRecord?: boolean;
  /** imported recording: where in the session's audio this was said (seconds) */
  audio?: { start: number; end: number };
}

// ---------------------------------------------------------------------------
// Decision model (Jev / rules)
// ---------------------------------------------------------------------------

export type DeviationType =
  | "none"
  | "skip"
  | "insert"
  | "reorder"
  | "loop"
  | "dwell"
  | "shortcut"
  | "external_detour"
  | "value_change"
  | "novel_entity"
  | "doc_contradiction";

export type InterruptAction = "ignore" | "ask_now" | "ask_before_commit" | "queue_debrief";

export type QuestionKind =
  | "why"
  | "guardrail"
  | "order"
  | "troubleshoot"
  | "counterfactual"
  | "contradiction"
  | "teachback";

export interface DeviationCandidate {
  type: DeviationType;
  detail: string;
  expected?: string[];
  surprise: number; // 0..1  (1 = never seen)
  novelty: number; // 0..1
  uncertainty: number; // 0..1 (no page covers it)
  irreversibleNext: boolean;
  docContradiction?: string;
}

export interface DecisionRecord {
  engine: "jev" | "rules";
  action: InterruptAction;
  deviationType: DeviationType;
  importance: number; // 0..1
  questionKind: QuestionKind;
  isTroubleshooting: boolean;
  matchedPageId?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
  latencyMs: number;
  rulesAction?: InterruptAction; // what the rule scorer said (for comparison)
  fellBack?: string;
}

export type QuestionStatus = "pending" | "asked" | "answered" | "skipped" | "dropped";

export interface Question {
  id: string;
  sessionId: string;
  ts: number;
  caseId?: string;
  eventId?: string;
  frameId?: string;
  kind: QuestionKind;
  timing: "live" | "pre_commit" | "debrief";
  text: string;
  importance: number;
  status: QuestionStatus;
  askedAt?: number;
  answer?: string;
  answerUtteranceIds?: string[];
  decision?: DecisionRecord;
  deviation?: DeviationCandidate;
  dedupeKey: string;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type SessionMode = "capture" | "teach" | "interview_free" | "interview_guided";

export interface Session {
  id: string;
  mode: SessionMode;
  /** application the expert works in: the instrumented mock (default) or a real app seen only through screen share */
  target?: "ledgerline" | "erpnext";
  /** last structured screen state the vision model read (ERPNext target) */
  screen?: ScreenState;
  personId: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  /** stopped with "Finish" before the teach-back was confirmed: nothing was committed to the hub */
  endedEarly?: boolean;
  phase: "live" | "debrief" | "teachback" | "done";
  events: AppEvent[];
  frames: Frame[];
  transcript: Utterance[];
  questions: Question[];
  offRecord: { from: number; to?: number }[];
  teachBack?: { text: string; confirmed: boolean; corrections?: string; at: number };
  workMap?: WorkMap;
  trainingCaseIds?: string[];
  teachResult?: TeachResult;
  /** imported recording (interviews): file under data/audio, language and speech-to-text engine */
  recording?: { file: string; mime: string; language?: string; durationSec?: number; stt: string };
}

// ---------------------------------------------------------------------------
// Knowledge: claims, pages, graph, docs, lessons
// ---------------------------------------------------------------------------

export type ClaimSource = "stated" | "observed" | "confirmed" | "doc" | "inferred" | "expert_edit";

export interface Provenance {
  source: ClaimSource;
  personId?: string;
  sessionId?: string;
  ts?: number; // absolute ms
  utteranceId?: string;
  frameId?: string;
  eventId?: string;
  quote?: string; // expert's own words
  docId?: string;
}

export type ConditionOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "exists" | "missing" | "contains";

export interface Condition {
  field: string; // path into the case context, e.g. supplier.country
  op: ConditionOp;
  value?: string | number | boolean | (string | number)[];
}

/** Machine-checkable guardrail: evaluated before a tool call. */
export interface GuardRule {
  when: Condition[]; // case context conditions
  onTool: string; // tool the check runs before, e.g. post_invoice
  argsWhen?: Condition[]; // conditions on the tool args (prefixed "args.")
  requirePriorTool?: string; // must have happened earlier in this case
  require?: Condition[]; // must hold, otherwise violation
  forbid?: boolean; // tool must not be called at all when `when` holds
}

export interface Guardrail {
  id: string;
  kind: "never" | "stop_and_ask" | "limit" | "require";
  text: string;
  contact?: string;
  rule?: GuardRule;
  provenance: Provenance[];
}

export interface PageItem {
  id: string;
  text: string;
  nodeId?: string; // execution-graph node
  provenance: Provenance[];
}

export interface Page {
  id: string;
  slug: string;
  title: string;
  situation: string;
  triggers: Condition[];
  triggerText: string;
  recognize: PageItem[];
  steps: PageItem[];
  why: PageItem[];
  guardrails: Guardrail[];
  edgeCases: (PageItem & { learnedAt: number })[];
  troubleshooting: { id: string; symptom: string; cause: string; fix: string; contact?: string; provenance: Provenance[] }[];
  mistakes: { id: string; text: string; count: number; lastAt: number }[];
  openQuestions: string[];
  /** disputed: two experts disagree — the contested rules are paused until someone decides */
  status: "draft" | "confirmed" | "stale" | "disputed";
  version: number;
  history: { version: number; at: number; summary: string; by: string; sessionId?: string }[];
  experts: string[];
  createdAt: number;
  updatedAt: number;
  /** newer knowledge that contradicts older knowledge on this page, and what was decided */
  conflicts?: PageConflict[];
  /** items taken out of the live page by a conflict — kept, attributed, and restorable */
  superseded?: SupersededItem[];
}

export type PageList = "recognize" | "steps" | "why" | "guardrails" | "edgeCases";

export interface PageConflict {
  id: string;
  /** changed: the world changed, the newer statement wins · disagreement: experts describe it differently, nobody wins yet */
  kind: "changed" | "disagreement";
  /** review: the newer statement was applied, a person should confirm · disputed: nothing applied, rules paused · resolved */
  status: "review" | "disputed" | "resolved";
  at: number;
  summary: string;
  older: { by: string[]; itemIds: string[]; texts: string[] };
  newer: { by: string; sessionId?: string; itemIds: string[]; texts: string[] };
  /** guardrails whose machine rule encoded the outdated fact (the text stays, the rule is switched off) */
  rulesOff?: { guardrailId: string; rule: GuardRule }[];
  /** the page as it was, for "keep old" */
  before?: { title: string; situation: string; triggers: Condition[]; triggerText: string };
  resolution?: "keep_new" | "keep_old" | "both";
  resolvedBy?: string;
  resolvedAt?: number;
}

export interface SupersededItem {
  list: PageList;
  item: PageItem | Guardrail;
  conflictId: string;
  at: number;
  by: string;
  reason: string;
}

export type GNodeType =
  | "start"
  | "end"
  | "action"
  | "decision"
  | "external_app"
  | "human_check"
  | "note"
  | "guardrail"
  | "troubleshoot";

export interface GNode {
  id: string;
  type: GNodeType;
  label: string;
  tool?: string;
  description?: string;
  pageIds: string[];
  provenance: Provenance[];
  count: number;
  avgMs?: number;
  x: number;
  y: number;
  groupId?: string;
}

export interface GEdge {
  id: string;
  from: string;
  to: string;
  count: number;
  prob: number;
  avgMs?: number;
  p90Ms?: number;
  condition?: string;
  when?: Condition[]; // machine-checkable version of `condition`
  experts: string[];
  source: "doc" | "observed" | "expert_edit" | "stated";
}

export interface PermGroup {
  id: string;
  nodeIds: string[];
  status: "unknown" | "permutable" | "ordered";
  questionId?: string;
  note?: string;
}

export interface ExecGraph {
  id: string;
  process: string;
  version: number;
  updatedAt: number;
  nodes: GNode[];
  edges: GEdge[];
  groups: PermGroup[];
  traces: { sessionId: string; caseId: string; personId: string; steps: { tool: string; ts: number }[] }[];
}

export interface WorkMapStep {
  id: string;
  index: number;
  caseId?: string;
  title: string;
  ts: number;
  offsetMs: number;
  frameId?: string;
  eventIds: string[];
  decision: string;
  reason?: { text: string; quote?: string; utteranceId?: string; questionId?: string; ts?: number };
  guardrails: { text: string; quote?: string; utteranceId?: string }[];
  nodeId?: string;
  pageId?: string;
}

export interface WorkMap {
  sessionId: string;
  summary: string;
  steps: WorkMapStep[];
  generatedBy: "llm" | "heuristic";
  generatedAt: number;
}

export interface Doc {
  id: string;
  title: string;
  kind: "process_doc" | "policy" | "transcript" | "note";
  content: string; // markdown
  source: string;
  createdAt: number;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  years?: number;
  kind: "expert" | "learner";
}

export interface LessonItem {
  id: string;
  kind: "explain" | "predict" | "quiz" | "case";
  prompt: string;
  options?: string[];
  answer?: string;
  explanation: string;
  quote?: string;
  frameId?: string;
  pageId?: string;
  nodeId?: string;
  caseId?: string;
}

export interface Lesson {
  id: string;
  title: string;
  kind: "walkthrough" | "drill" | "quiz" | "delta";
  pageIds: string[];
  items: LessonItem[];
  basedOn: { pageId: string; version: number }[];
  createdAt: number;
}

export interface TeachResult {
  learnerId: string;
  caught: { caseId: string; tool: string; guardrailId: string; pageId: string; at: number; explanation: string }[];
  predictions: { nodeId: string; correct: boolean; at: number }[];
  mastery: { pageId: string; title: string; level: "new" | "practicing" | "mastered" }[];
}

export interface Settings {
  privacyBlur: boolean;
  questionBudgetPer10Min: number;
  pauseMs: number;
}

export interface DB {
  suppliers: Supplier[];
  costCenters: CostCenter[];
  invoices: Invoice[];
  people: Person[];
  docs: Doc[];
  sessions: Session[];
  pages: Page[];
  graph: ExecGraph;
  lessons: Lesson[];
  tools?: ToolCatalog;
  /** generated domain MCPs of other applications (e.g. "erpnext"), keyed by app */
  catalogs?: Record<string, ToolCatalog>;
  /** read-only mirror of a real application's AP data, refreshed from its API */
  erp?: { app: "erpnext"; baseUrl: string; syncedAt: number; invoices: Invoice[]; suppliers: Supplier[]; costCenters: CostCenter[] };
  /** the company's supplier blacklist, dated — rules check "supplier.blacklisted" against it */
  blacklist?: BlacklistEntry[];
  /** list changes asky heard someone state — applied only when a person agrees */
  blacklistSuggestions?: BlacklistSuggestion[];
  settings: Settings;
  /** audience workspaces only: lifetime and what it may still spend */
  workspace?: { visitor: true; createdAt: number; expiresAt: number };
  usage?: { llm: number; ttsChars: number };
}

export interface BlacklistSuggestion {
  id: string;
  action: "add" | "remove";
  supplierName: string;
  /** not one of the suppliers asky knows from the apps */
  unknownSupplier?: boolean;
  reason: string;
  quote: string;
  personId: string;
  sessionId: string;
  utteranceId?: string;
  /** when it was said — becomes the listing date if applied */
  at: number;
  status: "pending" | "applied" | "dismissed";
  decidedBy?: string;
  decidedAt?: number;
}

/** One listing of a supplier: matched by name, so it holds for the mock app and for ERPNext alike. */
export interface BlacklistEntry {
  id: string;
  supplierName: string;
  reason: string;
  /** where it was announced, e.g. "company Slack #announcements" */
  source?: string;
  addedAt: number;
  addedBy: string;
  removedAt?: number;
  removedBy?: string;
  removedReason?: string;
  /** the session where someone said so, if it came from asky */
  sessionIds?: string[];
}

/** What the vision model reads off one frame of a real application. */
export interface ScreenState {
  app: string; // "ERPNext", "Excel", …
  view: "invoice_form" | "invoice_list" | "supplier_history" | "dialog" | "other";
  invoiceRef?: string; // what identifies the invoice on screen, e.g. "4471"
  costCenter?: string; // code as shown, e.g. "4711"
  assetNumber?: string;
  onHold?: boolean;
  status?: string; // indicator text: Draft, Pending Approval, Approved, Submitted / Unpaid …
  unsaved?: boolean; // "Not Saved" indicator
  dialog?: string; // text of a confirm dialog in front, e.g. "Permanently Submit Purchase Invoice?"
  supplier?: string; // supplier filter on a list / history view
  comment?: string; // newest comment text on the form
  section?: string; // form tab / section in view, e.g. "Taxes and Charges"
  activity?: string; // what changed since the previous frame, as read off the screen (unconfirmed)
  caption: string;
  ts: number;
}

/** Context a guardrail / deviation check sees for one case. */
export interface CaseContext {
  invoice: Invoice & {
    month: number;
    costCenterType?: CostCenterType;
    hasAssetNumber: boolean;
    lineCategories: string[];
    maxLineValue: number;
    approvalRoles: string[]; // roles approval was requested from
    approvedRoles: string[]; // roles that already approved
  };
  supplier: Supplier & { isNew: boolean; priorInvoicesSameAmount: number; blacklisted: boolean; blacklistReason?: string };
  trace: string[]; // tools called so far in this case
}
