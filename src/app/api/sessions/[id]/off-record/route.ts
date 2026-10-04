import { setOffRecord } from "@/lib/capture";
import { withWorkspace } from "@/lib/workspace";

async function handlePOST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { on } = (await req.json()) as { on: boolean };
  return Response.json(setOffRecord(id, on));
}

export const POST = withWorkspace(handlePOST);
