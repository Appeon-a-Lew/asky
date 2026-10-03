import { llmText, withFallback } from "../llm";
import type { AppEvent, DB, DecisionRecord, DeviationCandidate, Session } from "../types";
import type { Detection } from "./deviation";

// System 2: phrase the one spoken question. Short, about what is visible on
// screen, aimed at a reason or a guardrail — never something the screen
// already answers. Generated speculatively as soon as the decision is made,
// so it is ready when the pause arrives.

export async function phraseQuestion(d: DB, session: Session, ev: AppEvent, det: Detection, dec: DecisionRecord, top?: DeviationCandidate): Promise<string> {
  const fallback = () => templateQuestion(d, ev, det, dec, top);
  const res = await withFallback(
    () =>
      llmText({
        model: "fast",
        maxTokens: 80,
        system:
          "You are a curious, respectful apprentice watching an expert accountant work. Write ONE short spoken question (max 22 words) about the step that just happened on screen. Reference the concrete thing (invoice number, supplier, value). Ask for the reason, the rule, or the limit/guardrail — never ask what the screen already shows. For important judgment calls, combine why + limit (e.g. 'is there an amount where that changes?'). Output only the question.",
        prompt: JSON.stringify({
          latest_step: ev.summary,
          deviation: top ?? det.candidates[0],
          question_kind: dec.questionKind,
          supplier: det.ctx?.supplier.name,
          invoice: det.ctx && { id: det.ctx.invoice.id, amount: det.ctx.invoice.amount, description: det.ctx.invoice.description },
          already_known_pages: det.pages.map((p) => p.title),
          recent_transcript: session.transcript.slice(-6).map((u) => `${u.speaker}: ${u.text}`),
        }),
      }).then((t) => t.replace(/^["']|["']$/g, "")),
    fallback,
    "question",
  );
  return res.value;
}

export function templateQuestion(d: DB, ev: AppEvent, det: Detection, dec: DecisionRecord, top?: DeviationCandidate): string {
  const c = top ?? det.candidates[0];
  const id = ev.caseId ? `invoice ${ev.caseId}` : "this one";
  const sup = det.ctx?.supplier.name ?? "this supplier";
  const a = ev.args ?? {};
  switch (c?.type) {
    case "value_change": {
      const ch = a.__changed as { from: string; to: string } | undefined;
      const to = d.costCenters.find((x) => x.code === ch?.to);
      return `You moved ${id} from ${ch?.from} to ${ch?.to}${to ? ` (${to.type})` : ""} — what made you change it, and is there an amount where that rule kicks in?`;
    }
    case "doc_contradiction":
      if (ev.tool === "request_approval") return `The 2019 process only asks for approval above ten thousand euros, but you sent ${id} to ${a.approver ?? "approval"} — why this one?`;
      return `The written process says otherwise for ${id} — which is right, and why?`;
    case "insert":
      if (ev.tool === "get_supplier_history") return `You opened ${sup}'s history before deciding on ${id} — what were you looking for?`;
      if (ev.tool === "hold_invoice") return `You put ${id} on hold — what tipped you off, and what has to happen before it can be released?`;
      if (ev.tool === "request_approval") return `Why does ${id} need ${a.approver ?? "an extra approval"} — would you ever post it without?`;
      return `That step on ${id} isn't in the written process — why do you do it?`;
    case "skip":
      return `You went to ${ev.tool?.replace(/_/g, " ")} on ${id} without ${c.expected?.[0]?.replace(/_/g, " ") ?? "the usual check"} — is that always safe here?`;
    case "loop":
      return `${ev.tool?.replace(/_/g, " ")} didn't go through on ${id} — what usually causes that, and how do you get around it?`;
    case "reorder":
      return `On ${id} you did ${ev.tool?.replace(/_/g, " ")} earlier than usual — does the order of these steps matter?`;
    case "dwell":
      return `That step on ${id} took a while — what were you checking or waiting for?`;
    case "external_detour":
      return `You switched to ${ev.external?.app ?? "another app"} — what did you look up there?`;
    case "novel_entity":
      return `${sup} is new to me — is there anything you always check before booking a new supplier?`;
    default:
      return dec.questionKind === "guardrail" ? `Is there a case on ${id} where you would stop and ask someone first?` : `Why did you do that on ${id}?`;
  }
}
