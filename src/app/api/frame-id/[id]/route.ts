import fs from "node:fs";
import path from "node:path";
import { db, FRAMES_DIR } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const f = db().sessions.flatMap((s) => s.frames).find((x) => x.id === id);
  const p = f && path.join(FRAMES_DIR, f.file);
  if (!p || !fs.existsSync(p)) return new Response("not found", { status: 404 });
  return new Response(fs.readFileSync(p), { headers: { "content-type": "image/jpeg" } });
}
