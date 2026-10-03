import { addUtterance } from "@/lib/capture";
import type { Speaker } from "@/lib/types";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as { speaker: Speaker; text: string; ts?: number; questionId?: string };
  return Response.json(addUtterance(id, b));
}
