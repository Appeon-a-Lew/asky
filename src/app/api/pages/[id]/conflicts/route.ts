import { checkConflicts, resolveConflict } from "@/lib/knowledge/conflicts";
import { db } from "@/lib/store";
import { withWorkspace } from "@/lib/workspace";

// POST {conflictId, resolution, by?} → a person decides a conflict.
// POST {recheck: true} → compare the page's latest session with everything before it.
async function handlePOST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as { conflictId?: string; resolution?: "keep_new" | "keep_old" | "both"; by?: string; recheck?: boolean };
  if (b.recheck) {
    const p = db().pages.find((x) => x.id === id);
    const latest = [...(p?.history ?? [])].reverse().find((h) => h.sessionId)?.sessionId;
    if (!p || !latest) return Response.json({ conflicts: [] });
    return Response.json({ conflicts: await checkConflicts(id, latest) });
  }
  if (!b.conflictId || !b.resolution) return Response.json({ error: "conflictId and resolution required" }, { status: 400 });
  const c = resolveConflict(id, b.conflictId, b.resolution, b.by);
  return c ? Response.json(c) : Response.json({ error: "conflict not found or already resolved" }, { status: 404 });
}

export const POST = withWorkspace(handlePOST);
