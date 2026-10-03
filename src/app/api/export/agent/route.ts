import { describeCondition } from "@/lib/engine/context";
import { db } from "@/lib/store";

// Stretch goal "agent-ready guardrails": the knowledge as instructions an agent
// can load. Pair it with the asky MCP server (`pnpm mcp`), whose
// check_guardrail tool enforces the same rules before every write.
export async function GET(req: Request) {
  const d = db();
  const fmt = new URL(req.url).searchParams.get("format") ?? "md";
  const tools = d.tools?.tools ?? [];
  if (fmt === "json") return Response.json({ process: d.graph.process, tools, pages: d.pages.map((p) => ({ title: p.title, when: p.triggers, steps: p.steps.map((s) => ({ text: s.text, tool: s.nodeId })), guardrails: p.guardrails.map((g) => ({ kind: g.kind, text: g.text, rule: g.rule, contact: g.contact })) })) });
  const md = [
    `# Skill: ${d.graph.process}`,
    "",
    "You process supplier invoices in Ledgerline AP for Keller Maschinenbau GmbH, the way the AP experts do.",
    "Use the `ledgerline-ap` MCP tools. **Before every write or irreversible tool call, call `check_guardrail`** with the tool name and arguments. If it returns violations, do not proceed: follow the guardrail (e.g. request an approval, put the invoice on hold) or hand over to a human.",
    "",
    "## Tools",
    ...tools.map((t) => `- \`${t.name}\` (${t.effect}) — ${t.description}`),
    "",
    "## Situations",
    ...d.pages.flatMap((p) => [
      `### ${p.title}`,
      `When: ${p.triggerText}${p.triggers.length ? `  \n\`${p.triggers.map(describeCondition).join(" AND ")}\`` : ""}`,
      ...p.steps.map((s, k) => `${k + 1}. ${s.text}${s.nodeId ? ` (\`${s.nodeId}\`)` : ""}`),
      ...p.guardrails.map((g) => `- **${g.kind.replace("_", " ").toUpperCase()}**: ${g.text}${g.contact ? ` → ${g.contact}` : ""}`),
      ...(p.why[0] ? [`> Why (${d.people.find((x) => x.id === p.experts[0])?.name ?? "expert"}): "${p.why[0].text}"`] : []),
      "",
    ]),
    "## Always stop and hand over to a human when",
    "- a guardrail says STOP & ASK, or `check_guardrail` returns a violation you cannot resolve with a tool;",
    "- the situation matches no page and the next step is irreversible.",
  ].join("\n");
  return new Response(md, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": 'inline; filename="asky-agent-skill.md"' } });
}
