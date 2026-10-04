import { after } from "next/server";
import { suggestBlacklistChanges } from "@/lib/blacklist";
import { getSession } from "@/lib/capture";
import { mutate } from "@/lib/store";
import { withWorkspace } from "@/lib/workspace";

async function handleGET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = getSession((await ctx.params).id);
  return s ? Response.json(s) : Response.json({ error: "not found" }, { status: 404 });
}

// PATCH {end: true}: the person stopped early — keep what was recorded, commit nothing
async function handlePATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = (await ctx.params).id;
  const b = (await req.json().catch(() => ({}))) as { end?: boolean };
  const s = mutate((d) => {
    const ss = d.sessions.find((x) => x.id === id);
    if (ss && b.end && ss.phase !== "done") {
      ss.endedAt = Date.now();
      ss.endedEarly = true;
    }
    return ss;
  });
  // ended early: what was said still counts for the blacklist (it only becomes a suggestion)
  if (s && b.end) after(() => suggestBlacklistChanges(id).then(() => {}, () => {}));
  return s ? Response.json({ ok: true, phase: s.phase, endedEarly: !!s.endedEarly }) : Response.json({ error: "not found" }, { status: 404 });
}

export const GET = withWorkspace(handleGET);
export const PATCH = withWorkspace(handlePATCH);
