import { updateQuestion } from "@/lib/capture";
import type { Question } from "@/lib/types";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; qid: string }> }) {
  const { id, qid } = await ctx.params;
  const patch = (await req.json()) as Partial<Question>;
  try {
    return Response.json(updateQuestion(id, qid, patch));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
}
