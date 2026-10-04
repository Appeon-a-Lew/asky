import fs from "node:fs";
import path from "node:path";
import { db, framesDir } from "@/lib/store";
import { withWorkspace } from "@/lib/workspace";

async function handleGET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const f = db().sessions.flatMap((s) => s.frames).find((x) => x.id === id);
  const p = f && path.join(framesDir(), f.file);
  if (!p || !fs.existsSync(p)) return new Response("not found", { status: 404 });
  return new Response(fs.readFileSync(p), { headers: { "content-type": "image/jpeg" } });
}

export const GET = withWorkspace(handleGET);
