import fs from "node:fs";
import path from "node:path";
import { framesDir } from "@/lib/store";
import { withWorkspace } from "@/lib/workspace";

async function handleGET(_req: Request, ctx: { params: Promise<{ file: string[] }> }) {
  const { file } = await ctx.params;
  const p = path.join(framesDir(), ...file);
  if (!p.startsWith(framesDir() + path.sep) || !fs.existsSync(p)) return new Response("not found", { status: 404 });
  return new Response(fs.readFileSync(p), { headers: { "content-type": p.endsWith(".png") ? "image/png" : "image/jpeg", "cache-control": "max-age=3600" } });
}

export const GET = withWorkspace(handleGET);
