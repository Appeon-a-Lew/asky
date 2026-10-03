import { getSession } from "@/lib/capture";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = getSession((await ctx.params).id);
  return s ? Response.json(s) : Response.json({ error: "not found" }, { status: 404 });
}
