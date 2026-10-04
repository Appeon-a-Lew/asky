import fs from "node:fs";
import path from "node:path";
import { dataDir, db } from "@/lib/store";
import { withWorkspace } from "@/lib/workspace";

// The recording behind an imported interview, so a quote can be replayed in the expert's own voice.
async function handleGET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rec = db().sessions.find((s) => s.id === id)?.recording;
  if (!rec) return new Response("not found", { status: 404 });
  const file = path.join(dataDir(), "audio", path.basename(rec.file));
  if (!fs.existsSync(file)) return new Response("not found", { status: 404 });
  const buf = fs.readFileSync(file);
  // range requests let the browser seek to the quote
  const range = req.headers.get("range")?.match(/bytes=(\d+)-(\d*)/);
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : buf.length - 1;
    return new Response(buf.subarray(start, end + 1), { status: 206, headers: { "content-type": rec.mime, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${buf.length}`, "content-length": String(end - start + 1) } });
  }
  return new Response(buf, { headers: { "content-type": rec.mime, "accept-ranges": "bytes", "content-length": String(buf.length) } });
}

export const GET = withWorkspace(handleGET);
