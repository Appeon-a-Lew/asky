import { prepareDebrief } from "@/lib/knowledge/debrief";
import { withWorkspace } from "@/lib/workspace";

async function handlePOST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return Response.json({ questions: await prepareDebrief(id) });
}

export const POST = withWorkspace(handlePOST);
