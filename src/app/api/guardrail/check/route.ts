import { checkGuardrails } from "@/lib/engine/guard";
import { db } from "@/lib/store";
import { withWorkspace } from "@/lib/workspace";

// MCP `check_guardrail`: would this tool call break something the experts know?
async function handlePOST(req: Request) {
  const b = (await req.json()) as { tool: string; args?: Record<string, unknown>; caseId?: string; trace?: string[] };
  const args = b.args ?? {};
  const caseId = b.caseId ?? (typeof args.id === "string" ? args.id : undefined);
  const r = checkGuardrails(db(), b.tool, args, caseId, b.trace ?? []);
  return Response.json({
    allowed: r.violations.length === 0,
    violations: r.violations.map((v) => ({ page: v.pageTitle, guardrail: v.guardrail.text, kind: v.guardrail.kind, contact: v.guardrail.contact, reason: v.reason, expert_quote: v.quote })),
    applicable_guardrails: r.applicable.map((a) => a.text),
  });
}

export const POST = withWorkspace(handlePOST);
