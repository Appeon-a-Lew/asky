// asky domain MCP server (stdio).
// Serves the tools the harness generated for the app, plus knowledge tools.
// Every write/irreversible call is checked against the experts' guardrails
// first — an agent stops exactly where Sabine would.
//
//   ASKY_URL=http://localhost:3210 pnpm mcp

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { buildRequest, inputSchema } from "../src/lib/mcp/catalog";
import type { ToolCatalog } from "../src/lib/types";

const ASKY = process.env.ASKY_URL || "http://localhost:3210";
const log = (...a: unknown[]) => console.error("[asky-mcp]", ...a); // stdout is the protocol

async function http<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const r = await fetch(new URL(path, ASKY), { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as T };
}

const KNOWLEDGE_TOOLS = [
  {
    name: "check_guardrail",
    description: "Check a planned tool call against the experts' guardrails BEFORE calling it. Returns violations with the expert's reason. Always call this before any write or irreversible tool.",
    inputSchema: { type: "object", properties: { tool: { type: "string" }, args: { type: "object" }, trace: { type: "array", items: { type: "string" }, description: "tools already called for this invoice" } }, required: ["tool"] },
  },
  {
    name: "find_pages",
    description: "Find the knowledge pages (situations, steps, guardrails, the expert's reasons) that apply to an invoice.",
    inputSchema: { type: "object", properties: { caseId: { type: "string", description: "invoice id" } }, required: ["caseId"] },
  },
  {
    name: "get_page",
    description: "Read one knowledge page in full.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "get_process",
    description: "The execution graph of the process: steps (tools), observed transitions with probabilities and conditions.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function main() {
  const { json: catalog } = await http<ToolCatalog | null>("GET", "/api/harness/catalog");
  if (!catalog) throw new Error(`No tool catalog at ${ASKY}. Run \`pnpm harness\` first.`);
  log(`serving ${catalog.tools.length} ${catalog.app} tools + ${KNOWLEDGE_TOOLS.length} knowledge tools from ${ASKY}`);
  const traces = new Map<string, string[]>(); // per invoice, tools called in this MCP session

  const server = new Server({ name: `asky-${catalog.app}`, version: "1.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...catalog.tools.map((t) => ({
        name: t.name,
        title: t.title,
        description: `${t.description}${t.effect === "irreversible" ? " IRREVERSIBLE — check_guardrail first." : t.effect === "write" ? " Changes data." : ""}`,
        inputSchema: inputSchema(t),
        annotations: { readOnlyHint: t.effect === "read", destructiveHint: t.effect === "irreversible" },
      })),
      ...KNOWLEDGE_TOOLS,
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    const text = (o: unknown, isError = false) => ({ content: [{ type: "text" as const, text: typeof o === "string" ? o : JSON.stringify(o, null, 2) }], isError });

    switch (name) {
      case "check_guardrail": {
        const tool = String(args.tool);
        const a = (args.args ?? {}) as Record<string, unknown>;
        const caseId = typeof a.id === "string" ? a.id : undefined;
        const trace = (args.trace as string[]) ?? (caseId ? traces.get(caseId) ?? [] : []);
        return text((await http("POST", "/api/guardrail/check", { tool, args: a, trace })).json);
      }
      case "find_pages":
        return text((await http("GET", `/api/pages/match?caseId=${encodeURIComponent(String(args.caseId))}`)).json);
      case "get_page": {
        const { json } = await http<{ pages: { id: string }[] }>("GET", "/api/knowledge");
        return text(json.pages.find((p) => p.id === args.id) ?? "not found");
      }
      case "get_process": {
        const { json } = await http<{ graph: { nodes: { id: string; label: string; tool?: string }[]; edges: { from: string; to: string; prob: number; condition?: string; source: string }[] } }>("GET", "/api/knowledge");
        return text({ steps: json.graph.nodes.map((n) => ({ id: n.id, label: n.label, tool: n.tool })), transitions: json.graph.edges.filter((e) => e.source !== "doc").map((e) => ({ from: e.from, to: e.to, p: e.prob, when: e.condition })) });
      }
    }

    const tool = catalog.tools.find((t) => t.name === name);
    if (!tool) return text(`unknown tool ${name}`, true);
    const caseId = typeof args.id === "string" && tool.pathTemplate.includes("/invoices/") ? args.id : undefined;
    const trace = caseId ? traces.get(caseId) ?? [] : [];
    if (tool.effect !== "read") {
      const { json: g } = await http<{ allowed: boolean; violations: unknown[] }>("POST", "/api/guardrail/check", { tool: name, args, trace });
      if (!g.allowed) return text({ refused: true, message: "Guardrail violated — this is where the expert would stop. Resolve it or hand over to a human.", violations: g.violations }, true);
    }
    const r = buildRequest(tool, args);
    const res = await http(r.method, r.path, r.body);
    if (caseId && res.status < 400) traces.set(caseId, [...trace, name]);
    return text({ status: res.status, result: res.json }, res.status >= 400);
  });

  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  log(e.message);
  process.exit(1);
});
