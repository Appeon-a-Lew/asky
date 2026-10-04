import { finishInterview } from "@/lib/knowledge/interview";
import { withWorkspace } from "@/lib/workspace";

async function handlePOST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return Response.json(await finishInterview(id));
}

export const POST = withWorkspace(handlePOST);
