import "server-only";
import fs from "node:fs";
import path from "node:path";
import { decide } from "./engine/decide";
import { caseTrace, detectDeviations } from "./engine/deviation";
import { checkGuardrails, type Violation } from "./engine/guard";
import { scoreRules } from "./engine/rules";
import { phraseQuestion } from "./engine/question";
import { matchRequest } from "./mcp/catalog";
import { redact } from "./redact";
import { db, framesDir, mutate, uid } from "./store";
import type { AppEvent, DB, Question, Session, SessionMode, Speaker, ToolDef, Utterance } from "./types";

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function createSession(mode: SessionMode, personId: string, title?: string, trainingCaseIds?: string[], target?: Session["target"]): Session {
  const person = db().people.find((p) => p.id === personId);
  const s: Session = {
    id: uid("S-"),
    mode,
    target,
    personId,
    title: title || `${mode === "teach" ? "Training" : mode.startsWith("interview") ? "Interview" : "Capture"} · ${person?.name ?? personId}`,
    startedAt: Date.now(),
    phase: "live",
    events: [],
    frames: [],
    transcript: [],
    questions: [],
    offRecord: [],
    trainingCaseIds,
  };
  mutate((d) => d.sessions.push(s));
  return s;
}

export function getSession(id: string) {
  return db().sessions.find((s) => s.id === id);
}

function inSession<T>(id: string, fn: (s: Session, d: DB) => T): T {
  return mutate((d) => {
    const s = d.sessions.find((x) => x.id === id);
    if (!s) throw new Error(`session ${id} not found`);
    return fn(s, d);
  });
}

// ---------------------------------------------------------------------------
// Raw bridge messages → AppEvents
// ---------------------------------------------------------------------------

export type RawMsg =
  | { type: "asky:api"; method: string; path: string; body?: unknown; status: number; ok: boolean; response?: Record<string, unknown>; ts: number }
  | { type: "asky:ui"; action: "focus" | "input" | "click" | "nav"; field?: string; value?: string; label?: string; path?: string; ts: number }
  | { type: "asky:external"; app: string; description: string; ts: number; frameId?: string }
  // a step read off the screen of a real application (vision + its API), already in domain-tool terms
  | { type: "asky:observed"; tool: string; args: Record<string, unknown>; summary: string; caseId?: string; ts: number; frameId?: string };

function summarize(d: DB, tool: ToolDef, args: Record<string, unknown>, ok: boolean, response?: Record<string, unknown>): string {
  const id = args.id ? ` ${args.id}` : "";
  if (!ok) return `${tool.name}${id} failed: ${response?.error ?? "error"}`;
  switch (tool.name) {
    case "get_invoice": {
      const inv = d.invoices.find((i) => i.id === args.id);
      const sup = d.suppliers.find((s) => s.id === inv?.supplierId);
      return `opened invoice${id}${inv ? ` — ${sup?.name}, €${inv.amount.toLocaleString("de-DE")}, ${inv.description}` : ""}`;
    }
    case "set_invoice_coding": {
      const ch = response?.changed as { from: string; to: string } | undefined;
      return `invoice${id}: cost center ${ch && ch.from !== ch.to ? `${ch.from} → ${ch.to}` : `kept ${args.costCenter}`}${args.assetNumber ? `, asset ${args.assetNumber}` : ""}`;
    }
    case "hold_invoice": return `put invoice${id} on hold: "${args.reason}"`;
    case "request_approval": return `sent invoice${id} to ${args.approver} (${args.role}) for approval${args.reason ? `: "${args.reason}"` : ""}`;
    case "post_invoice": return `posted invoice${id}`;
    case "get_supplier_history": return `checked invoice history of supplier ${args.id}`;
    case "add_invoice_note": return `note on invoice${id}: "${args.text}"`;
    default: return `${tool.title}${id}`;
  }
}

function toEvent(d: DB, s: Session, m: RawMsg, currentCase: string | undefined): AppEvent | null {
  const base = { id: uid("E-"), sessionId: s.id, ts: m.ts };
  if (m.type === "asky:api") {
    const hit = matchRequest(d.tools, m.method, m.path, m.body);
    if (!hit) return null;
    const args = { ...hit.args };
    if (m.response?.changed) args.__changed = m.response.changed;
    let caseId = typeof args.id === "string" ? args.id : currentCase;
    if (hit.tool.name === "get_supplier_history") caseId = currentCase; // id is the supplier
    return { ...base, kind: "tool", tool: hit.tool.name, args, effect: hit.tool.effect, ok: m.ok, error: m.ok ? undefined : String(m.response?.error ?? m.status), caseId, summary: summarize(d, hit.tool, args, m.ok, m.response) };
  }
  if (m.type === "asky:ui") {
    if (m.action === "input") return null; // typing heartbeats are only used client-side for pause detection
    const caseFromNav = m.action === "nav" ? m.path?.match(/\/invoices\/([^/?]+)/)?.[1] : undefined;
    return { ...base, kind: "ui", ui: { action: m.action, field: m.field, label: m.label, value: m.value }, caseId: caseFromNav ?? currentCase, summary: m.action === "nav" ? `navigated to ${m.path}` : m.action === "click" ? `clicked "${m.label}"` : `focused ${m.field}` };
  }
  if (m.type === "asky:external") {
    return { ...base, kind: "external", external: { app: m.app, description: m.description }, caseId: currentCase, frameId: m.frameId, summary: `${m.app}: ${m.description}` };
  }
  if (m.type === "asky:observed") {
    const tool = d.tools?.tools.find((t) => t.name === m.tool);
    return { ...base, kind: "tool", tool: m.tool, args: m.args, effect: tool?.effect ?? "write", ok: true, caseId: m.caseId ?? currentCase, frameId: m.frameId, summary: m.summary };
  }
  return null;
}

function currentCaseOf(s: Session): string | undefined {
  for (let k = s.events.length - 1; k >= 0; k--) {
    const e = s.events[k];
    if (e.kind === "ui" && e.ui?.action === "nav") return e.caseId;
    if (e.caseId) return e.caseId;
  }
  return undefined;
}

export interface IngestResult {
  events: AppEvent[];
  questions: Question[];
  /** steps asky stayed quiet about because a page already explains them */
  recognized: { eventId: string; summary: string; pageId: string; title: string; status: string }[];
}

/** Ingest a batch of bridge messages: map, detect, decide, phrase. */
export async function ingest(sessionId: string, msgs: RawMsg[]): Promise<IngestResult> {
  const d = db();
  const s = d.sessions.find((x) => x.id === sessionId);
  if (!s) throw new Error("session not found");
  const out: IngestResult = { events: [], questions: [], recognized: [] };
  const offRecord = s.offRecord.some((o) => !o.to);

  for (const m of msgs) {
    const ev = toEvent(d, s, m, currentCaseOf(s));
    if (!ev) continue;
    // nearest frame becomes the event's screen moment
    const frame = [...s.frames].reverse().find((f) => Math.abs(f.ts - ev.ts) < 4000);
    if (frame && !offRecord) ev.frameId ??= frame.id;
    s.events.push(ev);
    out.events.push(ev);
    if (s.mode !== "capture" || (ev.kind !== "tool" && ev.kind !== "external")) continue;

    const det = detectDeviations(d, s, ev);
    const recognize = () => {
      if (ev.effect === "read" && ev.tool !== "get_supplier_history") return; // only decisions, not page views
      for (const p of det.knownBy) out.recognized.push({ eventId: ev.id, summary: ev.summary, pageId: p.id, title: p.title, status: p.status });
    };
    if (!det.candidates.length) {
      recognize();
      continue;
    }
    const dec = await decide(d, s, ev, det);
    if (dec.action === "ignore" || (dec.action === "queue_debrief" && det.knownBy.length)) {
      recognize();
      if (dec.action === "ignore") continue;
    }
    const top = scoreRules(det.candidates).top;
    const dedupeKey = `${ev.caseId}:${dec.deviationType}:${ev.tool ?? ev.external?.app}`;
    // same habit already asked about on another invoice → don't ask again
    const semanticKey = `${dec.deviationType}:${ev.tool ?? ev.external?.app}:${top?.expected?.join(",") ?? ""}`;
    if (s.questions.some((q) => q.dedupeKey === dedupeKey || (q.decision && `${q.decision.deviationType}:${s.events.find((e) => e.id === q.eventId)?.tool}:${q.deviation?.expected?.join(",") ?? ""}` === semanticKey))) continue;
    // ask less: one live interruption per case; the rest waits for the debrief unless critical
    const liveInCase = s.questions.some((q) => q.caseId === ev.caseId && q.timing !== "debrief");
    if (liveInCase && dec.action !== "queue_debrief" && dec.deviationType !== "doc_contradiction") {
      dec.action = "queue_debrief";
      dec.fellBack = [dec.fellBack, "one live question per case"].filter(Boolean).join("; ");
    }
    const text = await phraseQuestion(d, s, ev, det, dec, top);
    const q: Question = {
      id: uid("Q-"),
      sessionId: s.id,
      ts: ev.ts,
      caseId: ev.caseId,
      eventId: ev.id,
      frameId: ev.frameId,
      kind: dec.questionKind,
      timing: dec.action === "queue_debrief" ? "debrief" : dec.action === "ask_before_commit" ? "pre_commit" : "live",
      text,
      importance: dec.importance,
      status: "pending",
      decision: dec,
      deviation: top,
      dedupeKey,
    };
    s.questions.push(q);
    out.questions.push(q);
  }
  mutate(() => {}); // persist
  return out;
}

// ---------------------------------------------------------------------------
// Gate: before a mutating call reaches the app
// ---------------------------------------------------------------------------

export interface GateResult {
  allow: boolean;
  tool?: string;
  effect?: string;
  hold?: { question: Question };
  violations?: Violation[];
  message?: string;
}

export function gate(sessionId: string, method: string, reqPath: string, body: unknown): GateResult {
  const d = db();
  const hit = matchRequest(d.tools, method, reqPath, body);
  if (!hit) return { allow: true };
  return gateTool(sessionId, hit.tool.name, hit.args);
}

/** Gate a domain-tool call — from the instrumented app's request, or a confirm dialog seen on a real app's screen. */
/** Teach: the learner broke (or is about to break) a guardrail — counts toward the mistakes the page tracks. */
function recordCatch(sessionId: string, caseId: string, tool: string, v: Violation) {
  mutate((dd) => {
    const ss = dd.sessions.find((x) => x.id === sessionId)!;
    ss.teachResult ??= { learnerId: ss.personId, caught: [], predictions: [], mastery: [] };
    ss.teachResult.caught.push({ caseId, tool, guardrailId: v.guardrail.id, pageId: v.pageId, at: Date.now(), explanation: v.reason });
    const page = dd.pages.find((p) => p.id === v.pageId);
    if (page) {
      const m = page.mistakes.find((x) => x.text === v.guardrail.text);
      if (m) { m.count++; m.lastAt = Date.now(); }
      else page.mistakes.push({ id: uid("M-"), text: v.guardrail.text, count: 1, lastAt: Date.now() });
    }
  });
}

/**
 * Teach on a real app, where a save cannot be stopped: would this invoice pass
 * the posting guardrails as it stands now? scope "data": only missing data (an
 * asset number, a capex cost center) — after a save, or back on the list, where
 * workflow steps like an approval may still follow. scope "all": the learner
 * opened another invoice and left this one unfinished. Each guardrail is raised
 * once per invoice; the Post confirm stays a hard stop.
 */
export function tutorReadiness(sessionId: string, caseId: string, stage: "saved" | "left", scope: "data" | "all" = "data"): Violation | null {
  const d = db();
  const s = d.sessions.find((x) => x.id === sessionId);
  if (!s || s.mode !== "teach") return null;
  const inv = d.erp?.invoices.find((i) => i.id === caseId) ?? d.invoices.find((i) => i.id === caseId);
  if (!inv || inv.status === "posted") return null;
  const trace = caseTrace(s.events, caseId).map((e) => e.tool!).filter(Boolean);
  const { violations } = checkGuardrails(d, "post_invoice", { id: caseId }, caseId, trace);
  const raised = new Set((s.teachResult?.caught ?? []).filter((c) => c.caseId === caseId).map((c) => c.guardrailId));
  const v = violations.find((x) => !raised.has(x.guardrail.id) && (scope === "all" || !x.guardrail.rule?.requirePriorTool));
  if (!v) return null;
  recordCatch(sessionId, caseId, stage === "saved" ? "save_invoice" : "leave_invoice", v);
  return v;
}

export function gateTool(sessionId: string, toolName: string, args: Record<string, unknown>): GateResult {
  const d = db();
  const s = d.sessions.find((x) => x.id === sessionId);
  const tool = d.tools?.tools.find((t) => t.name === toolName);
  if (!s || !tool) return { allow: true };
  const hit = { tool, args };
  const caseId = typeof hit.args.id === "string" ? hit.args.id : currentCaseOf(s);
  const trace = caseId ? caseTrace(s.events, caseId).map((e) => e.tool!).filter(Boolean) : [];
  const { violations } = checkGuardrails(d, hit.tool.name, hit.args, caseId, trace);

  if (s.mode === "teach") {
    if (!violations.length) return { allow: true, tool: hit.tool.name, effect: hit.tool.effect };
    const v = violations[0];
    recordCatch(sessionId, caseId ?? "", hit.tool.name, v);
    return { allow: false, tool: hit.tool.name, effect: hit.tool.effect, violations, message: `Stopped before ${hit.tool.title.toLowerCase()}: ${v.guardrail.text}` };
  }

  if (s.mode === "capture") {
    // 1) expert is about to break a known guardrail → ask: exception or outdated rule?
    if (violations.length) {
      const v = violations[0];
      const key = `${caseId}:guardrail:${v.guardrail.id}`;
      let q = s.questions.find((x) => x.dedupeKey === key);
      if (!q) {
        q = { id: uid("Q-"), sessionId, ts: Date.now(), caseId, kind: "contradiction", timing: "pre_commit", importance: 0.95, status: "pending", dedupeKey: key,
          text: `Before you ${hit.tool.title.toLowerCase()}: the page "${v.pageTitle}" says "${v.guardrail.text}". Is this case an exception?` };
        const qq = q;
        mutate((dd) => dd.sessions.find((x) => x.id === sessionId)!.questions.push(qq));
      }
      if (q.status === "pending" || q.status === "asked") return { allow: false, tool: hit.tool.name, effect: hit.tool.effect, hold: { question: q }, violations };
    }
    // 2) irreversible step while an important question about this case is still open
    if (hit.tool.effect === "irreversible") {
      const open = s.questions
        .filter((q) => q.caseId === caseId && (q.timing === "live" || q.timing === "pre_commit") && q.status === "pending")
        .sort((a, b) => b.importance - a.importance)[0];
      if (open) return { allow: false, tool: hit.tool.name, effect: hit.tool.effect, hold: { question: open } };
    }
  }
  return { allow: true, tool: hit.tool.name, effect: hit.tool.effect };
}

// ---------------------------------------------------------------------------
// Transcript, questions, frames, privacy
// ---------------------------------------------------------------------------

export function addUtterance(sessionId: string, u: { speaker: Speaker; text: string; ts?: number; questionId?: string }): Utterance | null {
  return inSession(sessionId, (s) => {
    const off = s.offRecord.some((o) => !o.to);
    if (off && u.speaker !== "agent") return null; // not recorded at all
    const { text } = redact(u.text);
    const utt: Utterance = { id: uid("U-"), sessionId, ts: u.ts ?? Date.now(), speaker: u.speaker, text, questionId: u.questionId };
    s.transcript.push(utt);
    if (u.questionId && u.speaker !== "agent") {
      const q = s.questions.find((x) => x.id === u.questionId);
      if (q) {
        q.status = "answered";
        q.answer = q.answer ? `${q.answer} ${text}` : text;
        (q.answerUtteranceIds ??= []).push(utt.id);
      }
    }
    return utt;
  });
}

export function updateQuestion(sessionId: string, qid: string, patch: Partial<Pick<Question, "status" | "answer" | "askedAt" | "timing" | "text">>) {
  return inSession(sessionId, (s) => {
    const q = s.questions.find((x) => x.id === qid);
    if (!q) throw new Error("question not found");
    Object.assign(q, patch);
    if (patch.status === "asked" && !q.askedAt) q.askedAt = Date.now();
    return q;
  });
}

export function setOffRecord(sessionId: string, on: boolean) {
  return inSession(sessionId, (s) => {
    const open = s.offRecord.find((o) => !o.to);
    if (on && !open) s.offRecord.push({ from: Date.now() });
    if (!on && open) {
      open.to = Date.now();
      // purge everything captured inside the window except bare tool steps
      s.transcript = s.transcript.filter((u) => u.ts < open.from || u.ts > open.to! || u.speaker === "agent");
      const drop = s.frames.filter((f) => f.ts >= open.from && f.ts <= open.to!);
      for (const f of drop) fs.rmSync(path.join(framesDir(), f.file), { force: true });
      s.frames = s.frames.filter((f) => !drop.includes(f));
      for (const e of s.events) if (e.ts >= open.from && e.ts <= open.to!) e.frameId = undefined;
    }
    return s.offRecord;
  });
}

export function saveFrame(sessionId: string, dataUrl: string, ts: number, caption?: string) {
  const m = dataUrl.match(/^data:image\/(jpeg|png);base64,(.+)$/);
  if (!m) throw new Error("bad frame");
  const s = getSession(sessionId);
  if (!s || s.offRecord.some((o) => !o.to)) return null;
  const id = uid("F-");
  const file = `${sessionId}/${id}.${m[1] === "png" ? "png" : "jpg"}`;
  fs.mkdirSync(path.join(framesDir(), sessionId), { recursive: true });
  fs.writeFileSync(path.join(framesDir(), file), Buffer.from(m[2], "base64"));
  return inSession(sessionId, (ss) => {
    const f = { id, sessionId, ts, file, caption };
    ss.frames.push(f);
    return f;
  });
}
