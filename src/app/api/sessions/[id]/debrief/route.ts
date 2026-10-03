import { prepareDebrief } from "@/lib/knowledge/debrief";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return Response.json({ questions: await prepareDebrief(id) });
}
