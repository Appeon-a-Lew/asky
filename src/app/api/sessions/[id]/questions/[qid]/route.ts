import { updateQuestion } from "@/lib/capture";
import type { Question } from "@/lib/types";
import { withWorkspace } from "@/lib/workspace";

async function handlePATCH(req: Request, ctx: { params: Promise<{ id: string; qid: string }> }) {
  const { id, qid } = await ctx.params;
  const patch = (await req.json()) as Partial<Question>;
  try {
    return Response.json(updateQuestion(id, qid, patch));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
}

export const PATCH = withWorkspace(handlePATCH);
