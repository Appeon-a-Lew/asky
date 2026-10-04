import { buildCaseContext } from "../engine/context";
import { llmJSON, withFallback } from "../llm";
import type { Condition, DB, GuardRule, Page, Question, Session } from "../types";

// Session (events + Q&A + transcript) → draft knowledge: situations with
// machine-checkable triggers and guardrails, each tied to the expert's words.

export interface DraftRef {
  quote?: string;
  utteranceId?: string;
  questionId?: string;
}

export interface DraftSituation {
  key: string; // existing page slug to update, or a new slug
  title: string;
  situation: string;
  triggerText: string;
  triggers: Condition[];
  recognize: string[];
  steps: { text: string; tool?: string }[];
  why: ({ text: string } & DraftRef)[];
  guardrails: ({ kind: "never" | "stop_and_ask" | "limit" | "require"; text: string; contact?: string; rule?: GuardRule } & DraftRef)[];
  edgeCases: ({ text: string } & DraftRef)[];
  troubleshooting: ({ symptom: string; cause: string; fix: string; contact?: string } & DraftRef)[];
  openQuestions: string[];
  caseIds: string[];
}

export interface KnowledgeDraft {
  situations: DraftSituation[];
  processSummary: string;
  orderAnswers: { tools: string[]; permutable: boolean; quote?: string }[];
  by: "llm" | "heuristic";
}

export const CONTEXT_FIELDS = {
  "invoice.amount": "number, gross amount",
  "invoice.month": "number 1-12 of invoice date",
  "invoice.costCenter": "string code",
  "invoice.costCenterType": "'opex' | 'capex'",
  "invoice.hasAssetNumber": "boolean",
  "invoice.lineCategories": "array of material|service|equipment|office|logistics|intercompany (use op contains)",
  "invoice.maxLineValue": "number, largest line total",
  "invoice.approvalRoles": "array of roles approval was requested from: department_head|controller|cfo (use op contains)",
  "invoice.approvedRoles": "array of roles that approved (use op contains)",
  "supplier.id": "string",
  "supplier.name": "string (use op contains)",
  "supplier.country": "ISO-2",
  "supplier.isSubsidiary": "boolean, group company",
  "supplier.isNew": "boolean, never seen in earlier sessions",
  "supplier.priorInvoicesSameAmount": "number of earlier invoices from this supplier with the same amount",
  "supplier.blacklisted": "boolean, the supplier is currently on the company blacklist (kept, dated, in the hub) — use this instead of naming a supplier when a rule is about the blacklist",
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function qa(s: Session) {
  return s.questions
    .filter((q) => q.status === "answered" && q.answer)
    .map((q) => ({
      questionId: q.id,
      caseId: q.caseId,
      kind: q.kind,
      timing: q.timing,
      question: q.text,
      answer: q.answer!,
      utteranceId: q.answerUtteranceIds?.[0],
      deviation: q.deviation?.detail,
      step: s.events.find((e) => e.id === q.eventId)?.summary,
    }));
}

export async function extractKnowledge(d: DB, s: Session, corrections?: string): Promise<KnowledgeDraft> {
  const res = await withFallback(() => extractLLM(d, s, corrections), () => extractHeuristic(d, s, corrections), "extract");
  return res.value;
}

async function extractLLM(d: DB, s: Session, corrections?: string): Promise<KnowledgeDraft> {
  const person = d.people.find((p) => p.id === s.personId);
  const cases = [...new Set(s.events.filter((e) => e.caseId && e.kind === "tool").map((e) => e.caseId!))];
  const steps = cases.map((c) => {
    const ctx = buildCaseContext(d, c);
    return {
      caseId: c,
      invoice: ctx && { amount: ctx.invoice.amount, description: ctx.invoice.description, categories: ctx.invoice.lineCategories, month: ctx.invoice.month, costCenter: ctx.invoice.costCenter },
      supplier: ctx && { id: ctx.supplier.id, name: ctx.supplier.name, country: ctx.supplier.country, isSubsidiary: ctx.supplier.isSubsidiary },
      steps: s.events.filter((e) => e.caseId === c && e.kind !== "ui").map((e) => e.summary),
    };
  });
  const out = await llmJSON<Omit<KnowledgeDraft, "by">>({
    system: `You are asky, an AI apprentice that turns what an expert showed and said into a living knowledge base for new hires.
Create one "situation" per judgment (not per process): e.g. "Equipment over €5,000 is capex", "Group-company invoices need controller approval", "Supplier double-bills in December".
Rules:
- Only use what the expert actually said or did. Quote the expert's own words verbatim in "quote" and pass the utteranceId/questionId you got them from.
- triggers: machine-checkable conditions on these context fields only: ${JSON.stringify(CONTEXT_FIELDS)}. Keep them as general as the expert stated (use their thresholds), not overfitted to one invoice id.
- guardrails: things a new hire must not get wrong. Give each a machine-checkable rule when possible: rule.onTool is the tool the check runs before (usually post_invoice), rule.when = triggers, then either require (conditions that must hold), requirePriorTool (a tool that must have happened in the case), or forbid=true.
- steps refer to tool names where possible: ${(d.tools?.tools ?? []).map((t) => t.name).join(", ")}.
- If an existing page covers the same situation, reuse its key so it gets updated (add edge cases instead of duplicating).
- Facts that change over time (who is on a blacklist, who approves, current thresholds) are not the situation itself: title the page by the lasting rule ("Invoices from blacklisted suppliers go on hold"), and state the current value in a step or reason with who said it, not in the title.
- Language: write titles, situations, steps, guardrails and explanations in English (the hub's language), whatever language the expert spoke. Quotes stay verbatim in the original language; if that is not English, append the English translation in square brackets, e.g. "Über 5.000 Euro ist das Capex. [Over 5,000 euros that is capex.]".
- openQuestions: what is still unclear and should be asked next time.
- orderAnswers: when the expert said whether the order of steps matters.`,
    prompt: JSON.stringify({
      expert: person?.name,
      cases: steps,
      questions_and_answers: qa(s),
      transcript: s.transcript.filter((u) => !u.offRecord).map((u) => ({ id: u.id, speaker: u.speaker, text: u.text })),
      teach_back_corrections: corrections,
      existing_pages: d.pages.map((p) => ({ key: p.slug, title: p.title, triggers: p.triggers, guardrails: p.guardrails.map((g) => g.text) })),
    }),
    schema: draftSchema,
    name: "knowledge_draft",
    maxTokens: 8000,
  });
  // the model may leave out optional lists: everything downstream (commit, Work Map) expects arrays
  const casesOf = (sit: DraftSituation) => cases.filter((c) => s.events.some((e) => e.caseId === c && e.tool && (sit.steps ?? []).some((st) => st.tool === e.tool)));
  const situations = out.situations.map((x) => ({
    ...x,
    key: x.key || slug(x.title),
    triggers: x.triggers ?? [],
    recognize: x.recognize ?? [],
    steps: x.steps ?? [],
    why: x.why ?? [],
    guardrails: x.guardrails ?? [],
    edgeCases: x.edgeCases ?? [],
    troubleshooting: x.troubleshooting ?? [],
    openQuestions: x.openQuestions ?? [],
    caseIds: x.caseIds ?? casesOf(x),
  }));
  return { ...out, situations, orderAnswers: out.orderAnswers ?? [], by: "llm" };
}

const condSchema = {
  type: "object",
  properties: {
    field: { type: "string", enum: Object.keys(CONTEXT_FIELDS) },
    op: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "in", "exists", "missing", "contains"] },
    value: {},
  },
  required: ["field", "op"],
};
const ref = { quote: { type: "string" }, utteranceId: { type: "string" }, questionId: { type: "string" } };
const draftSchema = {
  type: "object",
  properties: {
    processSummary: { type: "string", description: "3-5 sentences: how this expert processes invoices overall" },
    situations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          title: { type: "string" },
          situation: { type: "string" },
          triggerText: { type: "string", description: "human-readable 'When …'" },
          triggers: { type: "array", items: condSchema },
          recognize: { type: "array", items: { type: "string" }, description: "how to recognize it on screen" },
          steps: { type: "array", items: { type: "object", properties: { text: { type: "string" }, tool: { type: "string" } }, required: ["text"] } },
          why: { type: "array", items: { type: "object", properties: { text: { type: "string" }, ...ref }, required: ["text"] } },
          guardrails: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["never", "stop_and_ask", "limit", "require"] },
                text: { type: "string" },
                contact: { type: "string" },
                rule: {
                  type: "object",
                  properties: {
                    onTool: { type: "string" },
                    when: { type: "array", items: condSchema },
                    require: { type: "array", items: condSchema },
                    requirePriorTool: { type: "string" },
                    forbid: { type: "boolean" },
                  },
                  required: ["onTool", "when"],
                },
                ...ref,
              },
              required: ["kind", "text"],
            },
          },
          edgeCases: { type: "array", items: { type: "object", properties: { text: { type: "string" }, ...ref }, required: ["text"] } },
          troubleshooting: { type: "array", items: { type: "object", properties: { symptom: { type: "string" }, cause: { type: "string" }, fix: { type: "string" }, contact: { type: "string" }, ...ref }, required: ["symptom", "cause", "fix"] } },
          openQuestions: { type: "array", items: { type: "string" } },
          caseIds: { type: "array", items: { type: "string" } },
        },
        required: ["key", "title", "situation", "triggerText", "triggers", "steps", "why", "guardrails"],
      },
    },
    orderAnswers: { type: "array", items: { type: "object", properties: { tools: { type: "array", items: { type: "string" } }, permutable: { type: "boolean" }, quote: { type: "string" } }, required: ["tools", "permutable"] } },
  },
  required: ["processSummary", "situations", "orderAnswers"],
};

// ---------------------------------------------------------------------------
// Heuristic extractor (no LLM): pattern rules keyed on tool + deviation type.
// ---------------------------------------------------------------------------

const money = (t: string): number | undefined => {
  const m = t.match(/(\d{1,3}(?:[.,\s]\d{3})+|\d+)(?:\s*(k|tausend|thousand))?\s*(?:€|eur|euro)?/i);
  if (!m) return undefined;
  let n = Number(m[1].replace(/[.,\s]/g, ""));
  if (m[2]) n *= 1000;
  return n >= 100 ? n : undefined;
};

const ROLE_WORDS: Record<string, string> = { controller: "controller", controlling: "controller", cfo: "cfo", "department head": "department_head", abteilungsleiter: "department_head" };

export function extractHeuristic(d: DB, s: Session, corrections?: string): KnowledgeDraft {
  const out = new Map<string, DraftSituation>();
  const add = (sit: DraftSituation) => {
    const prev = out.get(sit.key);
    if (!prev) return out.set(sit.key, sit);
    prev.why.push(...sit.why);
    prev.guardrails.push(...sit.guardrails.filter((g) => !prev.guardrails.some((x) => x.text === g.text)));
    prev.caseIds.push(...sit.caseIds);
  };
  const orderAnswers: KnowledgeDraft["orderAnswers"] = [];
  const answered = s.questions.filter((q) => q.status === "answered" && q.answer);
  const caseAnswers = (caseId?: string) => answered.filter((q) => q.caseId === caseId);

  for (const q of answered) {
    const ev = s.events.find((e) => e.id === q.eventId);
    const ctx = q.caseId ? buildCaseContext(d, q.caseId) : null;
    const answer = q.answer!;
    const lower = (answer + " " + caseAnswers(q.caseId).map((x) => x.answer).join(" ")).toLowerCase();
    const r: DraftRef = { quote: answer, utteranceId: q.answerUtteranceIds?.[0], questionId: q.id };
    const tool = ev?.tool;

    if (q.kind === "order") {
      const permutable = /(doesn'?t|does not|no) matter|any order|egal|either way|whatever order/i.test(answer);
      orderAnswers.push({ tools: [ev?.tool, s.events.filter((e) => e.caseId === q.caseId && e.kind === "tool" && e.ts < (ev?.ts ?? 0)).at(-1)?.tool].filter(Boolean) as string[], permutable, quote: answer });
      continue;
    }

    const changedValue = ev?.args?.__changed as { from: string; to: string } | undefined;
    if (tool === "set_invoice_coding" && ctx && changedValue && changedValue.from !== changedValue.to) {
      const ch = changedValue;
      const to = d.costCenters.find((c) => c.code === (ch?.to ?? ctx.invoice.costCenter));
      const cat = ctx.invoice.lineCategories[0];
      const threshold = money(answer) ?? Math.floor(ctx.invoice.maxLineValue / 1000) * 1000;
      const when: Condition[] = [{ field: "invoice.lineCategories", op: "contains", value: cat }, { field: "invoice.maxLineValue", op: "gt", value: threshold }];
      const sit: DraftSituation = {
        key: slug(`${cat} over ${threshold} is ${to?.type ?? "recoded"}`),
        title: `${cat[0].toUpperCase() + cat.slice(1)} over €${threshold.toLocaleString("en-US")} is ${to?.type ?? "re-coded"}`,
        situation: `${cat} invoice with a line above €${threshold.toLocaleString("en-US")}`,
        triggerText: `When an invoice line is ${cat} worth more than €${threshold.toLocaleString("en-US")}`,
        triggers: when,
        recognize: [`Line category "${cat}", pre-coded to an opex cost center`],
        steps: [{ text: `Re-code to ${to?.code} (${to?.name})`, tool: "set_invoice_coding" }],
        why: [{ text: answer, ...r }],
        guardrails: [{ kind: "require", text: `${cat} over €${threshold.toLocaleString("en-US")} must be booked to a ${to?.type ?? "capex"} cost center`, rule: { onTool: "post_invoice", when, require: [{ field: "invoice.costCenterType", op: "eq", value: to?.type ?? "capex" }] }, ...r }],
        edgeCases: [], troubleshooting: [], openQuestions: [], caseIds: [ctx.invoice.id],
      };
      if (/asset/.test(lower)) sit.guardrails.push({ kind: "never", text: "No asset number, no capex booking", rule: { onTool: "post_invoice", when: [...when, { field: "invoice.costCenterType", op: "eq", value: "capex" }], require: [{ field: "invoice.hasAssetNumber", op: "eq", value: true }] }, ...r });
      if (/(unknown|new) supplier|never seen/.test(lower)) {
        const role = Object.entries(ROLE_WORDS).find(([w]) => lower.includes(w))?.[1] ?? "controller";
        sit.guardrails.push({ kind: "stop_and_ask", text: `Unknown supplier: stop and ask the ${role.replace("_", " ")}`, contact: role, rule: { onTool: "post_invoice", when: [...when, { field: "supplier.isNew", op: "eq", value: true }], require: [{ field: "invoice.approvalRoles", op: "contains", value: role }] }, ...r });
      }
      add(sit);
      continue;
    }

    if (tool === "request_approval" && ctx) {
      const role = String(ev?.args?.role ?? "controller");
      const approver = String(ev?.args?.approver ?? role);
      const when: Condition[] = ctx.supplier.isSubsidiary ? [{ field: "supplier.isSubsidiary", op: "eq", value: true }] : [{ field: "supplier.id", op: "eq", value: ctx.supplier.id }];
      if (/czech|tschech|\bcz\b|prague|prag/.test(lower)) when.push({ field: "supplier.country", op: "eq", value: ctx.supplier.country });
      const label = ctx.supplier.isSubsidiary ? `${ctx.supplier.country} group-company invoices` : `${ctx.supplier.name} invoices`;
      add({
        key: slug(`${label} need ${role} approval`),
        title: `${label} need ${role.replace("_", " ")} approval`,
        situation: `Invoice from ${ctx.supplier.isSubsidiary ? "a group company" : ctx.supplier.name}${when.some((c) => c.field === "supplier.country") ? ` in ${ctx.supplier.country}` : ""}`,
        triggerText: `When the supplier is ${ctx.supplier.isSubsidiary ? `our ${ctx.supplier.country} subsidiary (${ctx.supplier.name})` : ctx.supplier.name}`,
        triggers: when,
        recognize: [`Supplier marked "group company", country ${ctx.supplier.country}`],
        steps: [{ text: `Send to ${approver} (${role.replace("_", " ")}) for a second approval`, tool: "request_approval" }, { text: "Post only after the approval is recorded", tool: "post_invoice" }],
        why: [{ text: answer, ...r }],
        guardrails: [{ kind: "require", text: `Never post without ${role.replace("_", " ")} approval, regardless of amount`, contact: approver, rule: { onTool: "post_invoice", when, require: [{ field: "invoice.approvedRoles", op: "contains", value: role }] }, ...r }],
        edgeCases: [], troubleshooting: [], openQuestions: [], caseIds: [ctx.invoice.id],
      });
      continue;
    }

    if ((tool === "hold_invoice" || tool === "get_supplier_history") && ctx) {
      if (/december|dezember|every year|jedes jahr|double|twice|duplicate|doppelt/.test(lower)) {
        const when: Condition[] = [{ field: "supplier.id", op: "eq", value: ctx.supplier.id }, { field: "invoice.month", op: "eq", value: 12 }];
        add({
          key: slug(`${ctx.supplier.name} double-bills in december`),
          title: `${ctx.supplier.name} double-bills in December`,
          situation: `December invoice from ${ctx.supplier.name}`,
          triggerText: `When ${ctx.supplier.name} sends an invoice in December`,
          triggers: when,
          recognize: ["Same amount and description as an invoice earlier in the month"],
          steps: [{ text: "Open the supplier history and compare amounts", tool: "get_supplier_history" }, { text: "If the same amount was already billed: put on hold as duplicate", tool: "hold_invoice" }],
          why: [{ text: answer, ...r }],
          guardrails: [{ kind: "require", text: `Check ${ctx.supplier.name}'s history before posting any December invoice`, rule: { onTool: "post_invoice", when, requirePriorTool: "get_supplier_history" }, ...r }],
          edgeCases: [], troubleshooting: [], openQuestions: [], caseIds: [ctx.invoice.id],
        });
        add({
          key: "duplicate-invoice-same-amount",
          title: "Possible duplicate invoice",
          situation: "Supplier already billed the same amount earlier",
          triggerText: "When an earlier invoice from the same supplier has the same amount",
          triggers: [{ field: "supplier.priorInvoicesSameAmount", op: "gt", value: 0 }],
          recognize: ["Supplier history shows the same amount already posted"],
          steps: [{ text: "Put on hold with reason 'duplicate'", tool: "hold_invoice" }, { text: "Ask the supplier for a credit note", tool: "add_invoice_note" }],
          why: [{ text: answer, ...r }],
          guardrails: [{ kind: "never", text: "Never post a suspected duplicate — hold it", rule: { onTool: "post_invoice", when: [{ field: "supplier.priorInvoicesSameAmount", op: "gt", value: 0 }], forbid: true }, ...r }],
          edgeCases: [], troubleshooting: [], openQuestions: [], caseIds: [ctx.invoice.id],
        });
        continue;
      }
    }

    if (q.kind === "troubleshoot" || q.deviation?.type === "loop") {
      const key = slug(`troubleshooting ${tool ?? "month end"}`);
      add({
        key, title: `Troubleshooting: ${tool?.replace(/_/g, " ") ?? "month-end problems"}`, situation: q.deviation?.detail ?? "Something went wrong", triggerText: "When the step fails or takes unusually long",
        triggers: [], recognize: [q.deviation?.detail ?? ""], steps: [], why: [], guardrails: [], edgeCases: [],
        troubleshooting: [{ symptom: q.deviation?.detail ?? q.text, cause: answer, fix: answer, ...r }], openQuestions: [], caseIds: q.caseId ? [q.caseId] : [],
      });
      continue;
    }

    // generic: attach the reason to the situation already learned for this case,
    // otherwise to one process-wide "general practice" page
    const owner = [...out.values()].find((x) => q.caseId && x.caseIds.includes(q.caseId));
    if (owner) {
      if (!owner.why.some((w) => w.text === answer)) owner.edgeCases.push({ text: answer, ...r });
      continue;
    }
    add({
      key: "general-practice", title: "General practice: invoice processing", situation: "Every invoice",
      triggerText: "For every invoice", triggers: [], recognize: [],
      steps: tool ? [{ text: q.deviation?.detail ?? ev?.summary ?? tool, tool }] : [],
      why: [{ text: answer, ...r }], guardrails: [], edgeCases: [], troubleshooting: [], openQuestions: [], caseIds: q.caseId ? [q.caseId] : [],
    });
  }

  if (corrections) {
    for (const sit of out.values()) sit.edgeCases.push({ text: `Expert correction during teach-back: ${corrections}`, quote: corrections });
  }
  const sits = [...out.values()];
  // existing pages with the same key are updated, not duplicated
  for (const sit of sits) {
    const existing = d.pages.find((p) => p.slug === sit.key || p.title.toLowerCase() === sit.title.toLowerCase());
    if (existing) sit.key = existing.slug;
  }
  return {
    situations: sits,
    processSummary: summarizeProcess(d, s),
    orderAnswers,
    by: "heuristic",
  };
}

function summarizeProcess(d: DB, s: Session) {
  const cases = new Set(s.events.filter((e) => e.caseId && e.kind === "tool").map((e) => e.caseId));
  const person = d.people.find((p) => p.id === s.personId)?.name ?? "The expert";
  return `${person} processed ${cases.size} invoices: open the invoice, check supplier and amount, fix the coding when the pre-coding is wrong, route special cases for approval or hold them, then post.`;
}

export function pageKey(p: Page) {
  return p.slug;
}

export function answeredQuestions(s: Session): Question[] {
  return s.questions.filter((q) => q.status === "answered");
}

// ---------------------------------------------------------------------------
// Free-form interview without an LLM: keep rule-like sentences as stated,
// unverified knowledge — capture sessions confirm or correct them later.
// ---------------------------------------------------------------------------

const RULE_WORDS = /\b(always|never|only|unless|if|when|above|over|below|under|must|have to|need to|before|after|every|immer|nie|nur|wenn)\b/i;

export function extractFreeHeuristic(s: Session): KnowledgeDraft {
  const text = s.transcript.filter((u) => u.speaker === "expert").map((u) => u.text).join(" ");
  const sentences = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 12);
  const rules = sentences.filter((x) => RULE_WORDS.test(x));
  const firstUtt = (sent: string) => s.transcript.find((u) => u.text.includes(sent.slice(0, 30)))?.id;
  return {
    situations: rules.length
      ? [{
          key: "stated-rules-interview", title: "Stated rules (from interview, unverified)", situation: "Rules the expert described in a free-form interview",
          triggerText: "Applies as described", triggers: [], recognize: [], steps: [],
          why: rules.map((r) => ({ text: r, quote: r, utteranceId: firstUtt(r) })),
          guardrails: rules.filter((r) => /\b(never|must|always|only|nie|immer)\b/i.test(r)).map((r) => ({ kind: /never|nie/i.test(r) ? ("never" as const) : ("require" as const), text: r, quote: r, utteranceId: firstUtt(r) })),
          edgeCases: [], troubleshooting: [],
          openQuestions: rules.slice(0, 5).map((r) => `Confirm on screen: "${r.slice(0, 80)}"`), caseIds: [],
        }]
      : [],
    processSummary: sentences.slice(0, 3).join(" "),
    orderAnswers: [],
    by: "heuristic",
  };
}
