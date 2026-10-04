import "server-only";
import { buildCaseContext, caseLabel, matchPages } from "./engine/context";
import { llmJSON, withFallback } from "./llm";
import { db, mutate } from "./store";
import type { Page } from "./types";

// Tutor brain: predictions, Q&A, mastery.

const STOP = new Set(["the", "a", "an", "to", "and", "or", "it", "is", "i", "you", "of", "in", "on", "for", "be", "would", "do", "this", "that", "with", "before", "first", "then"]);
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9äöüß€ ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

function keyTerms(p: Page) {
  const txt = [...p.steps.map((s) => s.text), ...p.guardrails.map((g) => g.text), p.title].join(" ");
  return [...new Set(words(txt))];
}

export function predictionPrompt(caseId: string) {
  const d = db();
  const ctx = buildCaseContext(d, caseId);
  if (!ctx) return null;
  const pages = matchPages(d.pages, ctx).filter((p) => p.steps.length || p.guardrails.length);
  if (!pages.length) return null;
  const p = pages[0];
  const expert = d.people.find((x) => x.id === p.experts[0])?.name.split(" ")[0] ?? "the expert";
  return {
    pageId: p.id,
    pageTitle: p.title,
    question: `Invoice ${caseLabel(d, caseId)} is from ${ctx.supplier.name}, ${ctx.invoice.description} for ${ctx.invoice.amount.toLocaleString("en-US")} euros. Before you touch anything — what do you think ${expert} would do here?`,
  };
}

export async function judgePrediction(pageId: string, answer: string) {
  const d = db();
  const p = d.pages.find((x) => x.id === pageId);
  if (!p) return { correct: false, feedback: "" };
  const expert = d.people.find((x) => x.id === p.experts[0])?.name.split(" ")[0] ?? "the expert";
  const quote = p.why[0]?.text;
  const res = await withFallback(
    () =>
      llmJSON<{ correct: boolean; feedback: string }>({
        model: "fast",
        system: `You are a friendly tutor. A new hire predicted what the expert ${expert} would do. Judge if the prediction captures the key decision (not wording). Feedback: max 2 short spoken sentences; if wrong, explain using the expert's own reason.`,
        prompt: JSON.stringify({ situation: p.triggerText, expert_steps: p.steps.map((s) => s.text), guardrails: p.guardrails.map((g) => g.text), expert_reason: quote, prediction: answer }),
        schema: { type: "object", properties: { correct: { type: "boolean" }, feedback: { type: "string" } }, required: ["correct", "feedback"] },
      }),
    () => {
      const terms = keyTerms(p);
      const said = new Set(words(answer));
      const hits = terms.filter((t) => said.has(t) || [...said].some((s) => s.startsWith(t.slice(0, 5)) && t.length > 5));
      const correct = hits.length >= 2 || (hits.length >= 1 && terms.length <= 4);
      return {
        correct,
        feedback: correct
          ? `Exactly — ${p.steps[0]?.text.toLowerCase() ?? p.guardrails[0]?.text}.`
          : `Not quite. ${p.steps[0]?.text ?? p.guardrails[0]?.text}. ${expert} said: "${quote ?? p.guardrails[0]?.text}"`,
      };
    },
    "judge",
  );
  return res.value;
}

// where things are on screen, per app — the tutor names buttons and fields exactly as the learner sees them
const LEDGERLINE_HELP = "Open an invoice from the inbox. In 'Account assignment' pick the cost center and type the asset number, then click 'Save coding'. Approvals: 'Request approval…'. Duplicates: 'Show supplier history', then 'Put on hold…'. 'Post invoice' is final.";
const ERPNEXT_HELP = "ERPNext: open Accounting → 'Purchase Invoice' and click the invoice. 'Cost Center', 'Asset Number' and 'Project' are in the 'Accounting Dimensions' section of the form; tax lines are in the 'Purchase Taxes and Charges' table under 'Taxes and Charges'. Save with 'Save' (Ctrl+S). The 'Actions' button has 'Request Approval', 'Approve', 'Hold' and 'Post' — 'Post' is final and asks 'Are you sure you want to Post?'. Supplier history: the Purchase Invoice list filtered by 'Supplier'. Comments go in the comment box at the bottom of the form.";

/** Answer the learner — or null when the utterance was not meant for the tutor (always-on mic). */
export async function answerLearner(question: string, caseId?: string): Promise<string | null> {
  const d = db();
  const ctx = caseId ? buildCaseContext(d, caseId) : null;
  const relevant = ctx ? matchPages(d.pages, ctx) : [];
  const all = [...relevant, ...d.pages.filter((p) => !relevant.includes(p))];
  const steps = d.graph.nodes.filter((n) => n.count > 0 && n.tool).sort((a, b) => a.y - b.y).map((n) => n.label);
  const res = await withFallback(
    async () => {
      const r = await llmJSON<{ addressed: boolean; answer: string }>({
        model: "fast",
        maxTokens: 300,
        system: `You are a voice tutor for a new accounts-payable clerk. Your microphone is always on, so you also hear background talk, other people, and the learner thinking aloud. Set addressed=false for anything that is not a question or request to you about the work (invoices, the app, the process, the rules). Otherwise answer in at most 3 short spoken sentences, in the SAME LANGUAGE as the learner, using ONLY the knowledge given. Quote the expert (Sabine) when helpful. If no invoice is open and they ask how to start, walk them through the first steps of the process. If the knowledge does not cover it, say so and suggest asking Sabine. Keep button and field names exactly as written in app_help (in English, in quotes), even when answering in another language.`,
        prompt: JSON.stringify({
          learner_said: question,
          open_invoice: ctx && { id: caseLabel(d, ctx.invoice.id), supplier: ctx.supplier.name, supplier_blacklisted: ctx.supplier.blacklisted ? ctx.supplier.blacklistReason ?? true : false, country: ctx.supplier.country, group_company: ctx.supplier.isSubsidiary, amount: ctx.invoice.amount, description: ctx.invoice.description, cost_center: ctx.invoice.costCenter, asset_number: ctx.invoice.assetNumber ?? null, status: ctx.invoice.status },
          process_steps: steps,
          app_help: d.erp?.invoices.some((i) => i.id === caseId) ? ERPNEXT_HELP : LEDGERLINE_HELP,
          pages: all.slice(0, 8).map((p) => ({
            title: p.title, when: p.triggerText, steps: p.steps.map((s) => s.text), guardrails: p.guardrails.map((g) => g.text), why: p.why.map((w) => w.text),
            // experts disagree here: say so and send the learner to them, don't pick a side
            ...(p.status === "disputed" ? { disputed: (p.conflicts ?? []).filter((c) => c.status === "disputed").map((c) => c.summary) } : {}),
          })),
        }),
        schema: { type: "object", properties: { addressed: { type: "boolean" }, answer: { type: "string" } }, required: ["addressed", "answer"] },
      });
      return r.addressed && r.answer.trim() ? r.answer.trim() : null;
    },
    () => {
      if (!/\?\s*$|^(why|what|how|when|should|do i|can i|is it|which|wie|warum|was|neden|nasıl)\b/i.test(question)) return null;
      const q = new Set(words(question));
      const scored = all.map((p) => ({ p, s: keyTerms(p).filter((t) => q.has(t)).length + (relevant.includes(p) ? 0.5 : 0) })).sort((a, b) => b.s - a.s);
      const best = scored[0];
      if (!best || best.s < 0.5) return steps.length ? `Start in the inbox: ${steps.slice(0, 4).join(", then ")}. For anything special, check the knowledge pages or ask Sabine.` : "I don't know that one yet — nothing on the knowledge pages covers it. Ask Sabine.";
      const p = best.p;
      return `${p.title}. ${p.steps.map((s) => s.text).join(", then ")}.${p.why[0] ? ` As Sabine put it: "${p.why[0].text}"` : ""}`;
    },
    "tutor-ask",
  );
  return res.value;
}

export function recordPrediction(sessionId: string, pageId: string, correct: boolean) {
  mutate((d) => {
    const s = d.sessions.find((x) => x.id === sessionId);
    if (!s) return;
    s.teachResult ??= { learnerId: s.personId, caught: [], predictions: [], mastery: [] };
    s.teachResult.predictions.push({ nodeId: pageId, correct, at: Date.now() });
  });
}

export function finishTeach(sessionId: string) {
  return mutate((d) => {
    const s = d.sessions.find((x) => x.id === sessionId);
    if (!s) return null;
    s.teachResult ??= { learnerId: s.personId, caught: [], predictions: [], mastery: [] };
    const cases = [...new Set(s.events.filter((e) => e.caseId).map((e) => e.caseId!))];
    const touched = new Map<string, Page>();
    for (const c of cases) {
      const ctx = buildCaseContext(d, c);
      if (ctx) for (const p of matchPages(d.pages, ctx)) touched.set(p.id, p);
    }
    s.teachResult.mastery = [...touched.values()].map((p) => {
      const caught = s.teachResult!.caught.filter((c) => c.pageId === p.id).length;
      const preds = s.teachResult!.predictions.filter((x) => x.nodeId === p.id);
      const right = preds.filter((x) => x.correct).length;
      const level: "new" | "practicing" | "mastered" = caught === 0 && (right > 0 || preds.length === 0) ? "mastered" : caught > 0 && right === 0 ? "new" : "practicing";
      return { pageId: p.id, title: p.title, level };
    });
    s.phase = "done";
    s.endedAt = Date.now();
    const practice = s.teachResult.mastery.filter((m) => m.level !== "mastered").map((m) => ({ ...m, lessonId: `LES-drill-${d.pages.find((p) => p.id === m.pageId)?.slug}` }));
    return { ...s.teachResult, practice, casesWorked: cases };
  });
}
