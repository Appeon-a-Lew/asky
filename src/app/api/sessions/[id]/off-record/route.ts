import { setOffRecord } from "@/lib/capture";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { on } = (await req.json()) as { on: boolean };
  return Response.json(setOffRecord(id, on));
}
