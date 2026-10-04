import Anthropic from "@anthropic-ai/sdk";
import { chargeLLM } from "./visitors";

// Thin Claude wrapper. Structured output via forced tool use so callers get
// typed JSON back. Every caller must have a deterministic fallback for when
// no ANTHROPIC_API_KEY is configured — the demo has to run offline too.

export const MODELS = {
  smart: process.env.ASKY_MODEL_SMART || "claude-opus-5-5",
  fast: process.env.ASKY_MODEL_FAST || "claude-haiku-4-5-20251001",
};

let client: Anthropic | null = null;
export function hasLLM() {
  return !!process.env.ANTHROPIC_API_KEY;
}
function anthropic() {
  if (!client) client = new Anthropic();
  return client;
}

type JSONSchema = Record<string, unknown>;

/** Strict-mode JSON schema: closed objects, no "any" values. */
function strictify(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(strictify);
  const s = { ...(schema as Record<string, unknown>) };
  if (Object.keys(s).length === 0 || (s.type === undefined && !s.anyOf && !s.enum && !s.$ref)) {
    return { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] } }] };
  }
  if (s.type === "object") {
    s.additionalProperties = false;
    if (s.properties) s.properties = Object.fromEntries(Object.entries(s.properties as Record<string, unknown>).map(([k, v]) => [k, strictify(v)]));
    else s.properties = {};
  }
  if (s.items) s.items = strictify(s.items);
  if (s.anyOf) s.anyOf = (s.anyOf as unknown[]).map(strictify);
  return s;
}

export async function llmJSON<T>(opts: {
  system: string;
  prompt: string;
  schema: JSONSchema; // JSON schema of the object to return
  name?: string;
  model?: keyof typeof MODELS;
  maxTokens?: number;
  images?: { mediaType: "image/jpeg" | "image/png"; data: string }[]; // base64
}): Promise<T> {
  chargeLLM(); // audience workspaces have a budget; over it, callers fall back to heuristics
  const name = opts.name ?? "respond";
  const content: Anthropic.ContentBlockParam[] = [];
  for (const img of opts.images ?? []) {
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
  }
  content.push({ type: "text", text: opts.prompt });
  const base = { model: MODELS[opts.model ?? "smart"], max_tokens: (opts.maxTokens ?? 4096) + ((opts.model ?? "smart") === "smart" ? 4000 : 0), system: opts.system, messages: [{ role: "user" as const, content }] };
  try {
    // structured outputs: the response text is guaranteed to match the schema
    const res = await anthropic().messages.create({ ...base, output_config: { format: { type: "json_schema", schema: strictify(opts.schema) as Record<string, unknown> } } });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return JSON.parse(text) as T;
  } catch (e) {
    if (!/output_config|json_schema|structured|schema/i.test((e as Error).message)) throw e;
    // older models: a single tool the model is told to call
    const res = await anthropic().messages.create({
      ...base,
      system: `${opts.system}\n\nAlways answer by calling the tool "${name}".`,
      tools: [{ name, description: "Return the result in this exact structure.", input_schema: opts.schema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "auto" },
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error("LLM returned no structured output");
    return block.input as T;
  }
}

export async function llmText(opts: { system: string; prompt: string; model?: keyof typeof MODELS; maxTokens?: number }): Promise<string> {
  chargeLLM();
  const smart = (opts.model ?? "fast") === "smart";
  const res = await anthropic().messages.create({
    model: MODELS[opts.model ?? "fast"],
    // the smart model thinks first: leave headroom so the answer is not cut off
    max_tokens: (opts.maxTokens ?? 300) + (smart ? 3000 : 0),
    ...(smart ? { output_config: { effort: "low" as const } } : {}),
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  if (!text) throw new Error(`empty LLM answer (stop_reason=${res.stop_reason})`);
  return text;
}

/** Run an LLM call if configured, otherwise (or on error) use the fallback. */
export async function withFallback<T>(llm: () => Promise<T>, fallback: () => T | Promise<T>, label = "llm"): Promise<{ value: T; by: "llm" | "heuristic"; error?: string }> {
  if (!hasLLM()) return { value: await fallback(), by: "heuristic" };
  try {
    return { value: await llm(), by: "llm" };
  } catch (e) {
    console.warn(`[${label}] LLM failed, using fallback:`, (e as Error).message);
    return { value: await fallback(), by: "heuristic", error: (e as Error).message };
  }
}
