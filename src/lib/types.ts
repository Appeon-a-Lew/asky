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
}

// ---------------------------------------------------------------------------
// Generated domain MCP (output of the harness)
// ---------------------------------------------------------------------------

export type ToolEffect = "read" | "write" | "irreversible";

export interface ToolParam {
  name: string;
  in: "path" | "query" | "body";
  type: "string" | "number" | "boolean";
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
  personId: string;
  title: string;
  startedAt: number;
  endedAt?: number;
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
  status: "draft" | "confirmed" | "stale";
  version: number;
  history: { version: number; at: number; summary: string; by: string; sessionId?: string }[];
  experts: string[];
  createdAt: number;
  updatedAt: number;
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
  settings: Settings;
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
  supplier: Supplier & { isNew: boolean; priorInvoicesSameAmount: number };
  trace: string[]; // tools called so far in this case
}
