import { buildCaseContext, matchPages } from "@/lib/engine/context";
import { db } from "@/lib/store";

// Which knowledge pages apply to this invoice? (MCP `find_pages`, tutor)
export async function GET(req: Request) {
  const caseId = new URL(req.url).searchParams.get("caseId") ?? "";
  const d = db();
  const ctx = buildCaseContext(d, caseId);
  if (!ctx) return Response.json({ error: "unknown case" }, { status: 404 });
  return Response.json(matchPages(d.pages, ctx).map((p) => ({ id: p.id, title: p.title, when: p.triggerText, steps: p.steps.map((s) => s.text), guardrails: p.guardrails.map((g) => g.text), why: p.why[0]?.text })));
}
