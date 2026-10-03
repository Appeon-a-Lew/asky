import { hasLLM, llmJSON } from "./llm";

// Screen understanding for everything outside the instrumented app
// (Excel, Outlook, a PDF, the ERP's other screens). Returns events, not video.

export interface VisionResult {
  changed: boolean;
  app?: string; // e.g. "Excel", "Outlook" — undefined when the instrumented app is in front
  description: string;
  caption: string;
}

export async function describeFrame(dataUrl: string, prevCaption?: string): Promise<VisionResult | null> {
  if (!hasLLM()) return null;
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png));base64,(.+)$/);
  if (!m) return null;
  try {
    return await llmJSON<VisionResult>({
      model: "fast",
      maxTokens: 300,
      system:
        "You watch an accountant's shared screen. Describe what is in front in one short caption. If the foreground is NOT the web app 'Ledgerline AP', set app to the application name (Excel, Outlook, Word, PDF viewer, browser site…) and describe what the person is looking up or doing there, with concrete visible values. Set changed=false if the screen shows essentially the same activity as the previous caption. Never transcribe personal data such as IBANs, emails or phone numbers.",
      prompt: `Previous caption: ${prevCaption ?? "(none)"}`,
      images: [{ mediaType: m[1] as "image/jpeg" | "image/png", data: m[2] }],
      schema: {
        type: "object",
        properties: { changed: { type: "boolean" }, app: { type: "string" }, description: { type: "string" }, caption: { type: "string" } },
        required: ["changed", "description", "caption"],
      },
      name: "screen_event",
    });
  } catch (e) {
    console.warn("[vision]", (e as Error).message);
    return null;
  }
}
