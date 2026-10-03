import type { ToolCatalog, ToolDef } from "../types";

// Maps raw HTTP traffic from an instrumented app onto the generated MCP tools.
// This is the bridge between "clicks" and the domain vocabulary the
// execution graph is written in.

export function compileTemplate(t: string): RegExp {
  const src = t
    .split("/")
    .map((seg) => (/^\{\w+\}$/.test(seg) ? "([^/]+)" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${src}$`);
}

export function matchRequest(
  catalog: ToolCatalog | undefined,
  method: string,
  url: string,
  body?: unknown,
): { tool: ToolDef; args: Record<string, unknown> } | null {
  if (!catalog) return null;
  const u = new URL(url, "http://x");
  for (const tool of catalog.tools) {
    if (tool.method !== method.toUpperCase()) continue;
    const m = u.pathname.match(compileTemplate(tool.pathTemplate));
    if (!m) continue;
    const names = [...tool.pathTemplate.matchAll(/\{(\w+)\}/g)].map((x) => x[1]);
    const args: Record<string, unknown> = {};
    names.forEach((n, k) => (args[n] = decodeURIComponent(m[k + 1])));
    u.searchParams.forEach((v, k) => (args[k] = v));
    if (body && typeof body === "object") Object.assign(args, body as Record<string, unknown>);
    return { tool, args };
  }
  return null;
}

/** Build the concrete HTTP request for a tool call (used by the MCP server / agents). */
export function buildRequest(tool: ToolDef, args: Record<string, unknown>) {
  let path = tool.pathTemplate;
  const query = new URLSearchParams();
  const body: Record<string, unknown> = {};
  for (const p of tool.params) {
    const v = args[p.name];
    if (v === undefined) continue;
    if (p.in === "path") path = path.replace(`{${p.name}}`, encodeURIComponent(String(v)));
    else if (p.in === "query") query.set(p.name, String(v));
    else body[p.name] = v;
  }
  const qs = query.toString();
  return { method: tool.method, path: qs ? `${path}?${qs}` : path, body: Object.keys(body).length ? body : undefined };
}

/** JSON schema for a tool's input, for MCP registration. */
export function inputSchema(tool: ToolDef) {
  const properties: Record<string, unknown> = {};
  for (const p of tool.params) {
    properties[p.name] = { type: p.type, description: p.description, ...(p.enum ? { enum: p.enum } : {}) };
  }
  return { type: "object", properties, required: tool.params.filter((p) => p.required).map((p) => p.name) };
}
