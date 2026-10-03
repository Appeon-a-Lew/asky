import fs from "node:fs";
import path from "node:path";
import { FRAMES_DIR } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string[] }> }) {
  const { file } = await ctx.params;
  const p = path.join(FRAMES_DIR, ...file);
  if (!p.startsWith(FRAMES_DIR) || !fs.existsSync(p)) return new Response("not found", { status: 404 });
  return new Response(fs.readFileSync(p), { headers: { "content-type": p.endsWith(".png") ? "image/png" : "image/jpeg", "cache-control": "max-age=3600" } });
}
