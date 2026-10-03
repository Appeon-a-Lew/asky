import { llmJSON, withFallback } from "../llm";
import type { ToolCatalog, ToolDef, ToolEffect, ToolParam } from "../types";

// Turns what the harness discovered about an application (OpenAPI + UI crawl)
// into a domain MCP tool catalog. Heuristics give a solid baseline; the LLM
// rewrites descriptions in business language and double-checks side effects.

export interface CrawlObservation {
  page: string; // URL path where the control was found
  uiLabel: string; // button text
  method: string;
  url: string;
  body?: unknown;
  confirmText?: string; // text of a confirm dialog shown before the request
}

interface OpenAPIOp {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: { name: string; in: string; required?: boolean; description?: string; schema?: { type?: string; enum?: string[] } }[];
  requestBody?: { content?: { "application/json"?: { schema?: { properties?: Record<string, { type?: string; enum?: string[]; description?: string }>; required?: string[] } } } };
}

export interface OpenAPISpec {
  info?: { title?: string };
  paths: Record<string, Record<string, OpenAPIOp>>;
}

const IRREVERSIBLE = /cannot be undone|irreversible|permanent|can't be undone|payment run|release.*payment/i;
const IRREVERSIBLE_NAME = /(^|_)(post|pay|delete|remove|submit|send_payment|transfer|finali[sz]e)(_|$)/;
const ADMIN = /\(admin\)|sandbox|\/reset\b/i;

export const snake = (s: string) =>
  s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();

const VERB: Record<string, string> = { get: "Open", list: "List", set: "Set", add: "Add", hold: "Hold", release: "Release", request: "Request", approve: "Approve", post: "Post", delete: "Delete", update: "Update", create: "Create" };
/** get_supplier_history → "Open supplier history" */
export const humanize = (name: string) => {
  const [v, ...rest] = name.split("_");
  return [VERB[v] ?? v[0].toUpperCase() + v.slice(1), ...rest].join(" ");
};

const asType = (t?: string): ToolParam["type"] => (t === "number" || t === "integer" ? "number" : t === "boolean" ? "boolean" : "string");

export function heuristicCatalog(app: string, baseUrl: string, spec: OpenAPISpec, crawl: CrawlObservation[]): ToolCatalog {
  const tools: ToolDef[] = [];
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [m, op] of Object.entries(methods)) {
      const method = m.toUpperCase() as ToolDef["method"];
      const name = snake(op.operationId || `${m}_${path}`);
      const summary = op.summary || op.description || name;
      if (ADMIN.test(summary) || ADMIN.test(path)) continue;
      const params: ToolParam[] = (op.parameters ?? [])
        .filter((p) => p.in === "path" || p.in === "query")
        .map((p) => ({ name: p.name, in: p.in as "path" | "query", type: asType(p.schema?.type), required: !!p.required || p.in === "path", description: p.description, enum: p.schema?.enum }));
      const bodySchema = op.requestBody?.content?.["application/json"]?.schema;
      for (const [pn, ps] of Object.entries(bodySchema?.properties ?? {})) {
        params.push({ name: pn, in: "body", type: asType(ps.type), required: (bodySchema?.required ?? []).includes(pn), description: ps.description, enum: ps.enum });
      }
      const re = new RegExp(`^${path.replace(/\{\w+\}/g, "[^/]+")}$`);
      const hits = crawl.filter((c) => c.method.toUpperCase() === method && re.test(new URL(c.url, "http://x").pathname));
      const evidence = [`openapi: ${method} ${path} (${op.operationId ?? "no operationId"})`];
      let effect: ToolEffect = method === "GET" ? "read" : "write";
      const confirm = hits.find((h) => h.confirmText && IRREVERSIBLE.test(h.confirmText));
      if (method !== "GET" && (confirm || IRREVERSIBLE.test(summary) || IRREVERSIBLE_NAME.test(name))) {
        effect = "irreversible";
        evidence.push(confirm ? `ui: confirm dialog "${confirm.confirmText!.slice(0, 80)}"` : `summary/name suggests irreversible`);
      }
      for (const h of hits) evidence.push(`ui: "${h.uiLabel}" on ${h.page}`);
      tools.push({
        name,
        title: humanize(name),
        description: summary,
        method,
        pathTemplate: path,
        params,
        effect,
        uiLabels: [...new Set(hits.map((h) => h.uiLabel))],
        evidence,
      });
    }
  }
  return { app, baseUrl, generatedAt: new Date().toISOString(), generator: "heuristic", tools };
}

export async function generateCatalog(app: string, baseUrl: string, spec: OpenAPISpec, crawl: CrawlObservation[]): Promise<ToolCatalog> {
  const draft = heuristicCatalog(app, baseUrl, spec, crawl);
  const res = await withFallback(
    async () => {
      const out = await llmJSON<{ tools: { name: string; title: string; description: string; effect: ToolEffect; why: string }[] }>({
        system:
          "You are the asky MCP harness. You turn a discovered business application into a domain-specific tool catalog that an AI apprentice uses to understand expert work. Write titles/descriptions in the business language of the domain (what the step means for the business, when it is used), not HTTP jargon. Classify each tool's effect: read (no change), write (changes data, can be corrected later), irreversible (cannot be undone or triggers money/external effects). Keep tool names exactly as given.",
        prompt: `Application: ${app}\n\nOpenAPI summary:\n${JSON.stringify(spec.paths, null, 1).slice(0, 12000)}\n\nUI crawl observations (button → request, confirm dialogs):\n${JSON.stringify(crawl, null, 1).slice(0, 8000)}\n\nDraft tools:\n${JSON.stringify(draft.tools.map((t) => ({ name: t.name, method: t.method, path: t.pathTemplate, effect: t.effect, uiLabels: t.uiLabels })), null, 1)}`,
        schema: {
          type: "object",
          properties: {
            tools: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  title: { type: "string", description: "short imperative, e.g. 'Re-code invoice to a cost center'" },
                  description: { type: "string", description: "1-2 sentences: business meaning and when an AP clerk does it" },
                  effect: { type: "string", enum: ["read", "write", "irreversible"] },
                  why: { type: "string", description: "evidence for the effect classification" },
                },
                required: ["name", "title", "description", "effect", "why"],
              },
            },
          },
          required: ["tools"],
        },
        name: "tool_catalog",
      });
      const byName = new Map(out.tools.map((t) => [t.name, t]));
      return {
        ...draft,
        generator: "llm" as const,
        tools: draft.tools.map((t) => {
          const r = byName.get(t.name);
          return r ? { ...t, title: r.title, description: r.description, effect: r.effect, evidence: [...t.evidence, `llm: ${r.why}`] } : t;
        }),
      };
    },
    () => draft,
    "mcp-generate",
  );
  return res.value;
}
