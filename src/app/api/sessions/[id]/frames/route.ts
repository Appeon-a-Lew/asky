import { ingest, saveFrame } from "@/lib/capture";
import { describeFrame } from "@/lib/vision";

// A frame every 1–2 s from the shared screen. Stored as screen moments; when
// the expert is outside the instrumented app, the vision model turns the
// frame into an "external" event (e.g. "Excel: budget sheet, row Capex 2025").
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as { dataUrl: string; ts: number; describe?: boolean; prevCaption?: string };
  const frame = saveFrame(id, b.dataUrl, b.ts);
  if (!frame) return Response.json({ frame: null, offRecord: true });
  if (!b.describe) return Response.json({ frame });
  const v = await describeFrame(b.dataUrl, b.prevCaption);
  if (!v || !v.changed || !v.app) return Response.json({ frame, vision: v });
  const r = await ingest(id, [{ type: "asky:external", app: v.app, description: v.description, ts: b.ts, frameId: frame.id }]);
  return Response.json({ frame, vision: v, ...r });
}
