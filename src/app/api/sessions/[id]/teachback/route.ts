import { classifyTeachBackReply, confirmTeachBack, makeTeachBack } from "@/lib/knowledge/debrief";

// POST {} → generate teach-back. POST {reply} → confirm / correct / unclear. POST {confirmed, corrections} → confirm (commit) or redo.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { confirmed?: boolean; corrections?: string; reply?: string };
  if (b.reply !== undefined) return Response.json({ kind: await classifyTeachBackReply(id, b.reply) });
  if (b.confirmed === undefined) {
    const t = await makeTeachBack(id, b.corrections);
    return Response.json({ text: t.text, situations: t.draft.situations.length, by: t.draft.by });
  }
  return Response.json(await confirmTeachBack(id, b.confirmed, b.corrections));
}
