import { gate } from "@/lib/capture";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as { method: string; path: string; body?: unknown };
  return Response.json(gate(id, b.method, b.path, b.body));
}
