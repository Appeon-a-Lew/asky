import { ingest, type RawMsg } from "@/lib/capture";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { msgs } = (await req.json()) as { msgs: RawMsg[] };
  try {
    return Response.json(await ingest(id, msgs));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
