import { regenerateLessons } from "@/lib/knowledge/lessons";
import { mutate, uid } from "@/lib/store";
import type { Page } from "@/lib/types";

// Expert edits from the hub: confirm / mark stale, add an edge case or note.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as { status?: Page["status"]; addEdgeCase?: string; by?: string; resolveQuestion?: string };
  const page = mutate((d) => {
    const p = d.pages.find((x) => x.id === id);
    if (!p) return null;
    const by = b.by ?? "sabine";
    if (b.status && b.status !== p.status) {
      p.status = b.status;
      p.version++;
      p.history.push({ version: p.version, at: Date.now(), by: d.people.find((x) => x.id === by)?.name ?? by, summary: `Marked ${b.status}` });
    }
    if (b.addEdgeCase) {
      p.edgeCases.push({ id: uid("I-"), text: b.addEdgeCase, learnedAt: Date.now(), provenance: [{ source: "expert_edit", personId: by, ts: Date.now(), quote: b.addEdgeCase }] });
      p.version++;
      p.history.push({ version: p.version, at: Date.now(), by: d.people.find((x) => x.id === by)?.name ?? by, summary: "Edge case added in the hub" });
    }
    if (b.resolveQuestion) p.openQuestions = p.openQuestions.filter((q) => q !== b.resolveQuestion);
    p.updatedAt = Date.now();
    regenerateLessons(d, [p.id]);
    return p;
  });
  return page ? Response.json(page) : Response.json({ error: "not found" }, { status: 404 });
}
