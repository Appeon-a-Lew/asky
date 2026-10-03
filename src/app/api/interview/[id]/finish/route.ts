import { finishInterview } from "@/lib/knowledge/interview";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return Response.json(await finishInterview(id));
}
