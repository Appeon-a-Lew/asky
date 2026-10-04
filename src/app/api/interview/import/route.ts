import fs from "node:fs";
import path from "node:path";
import { importInterview } from "@/lib/knowledge/interview";

export const maxDuration = 300;

// A recorded interview → ElevenLabs Scribe → knowledge pages.
// multipart: file + personId · or JSON { sample: true, personId } for the bundled demo recording.
export async function POST(req: Request) {
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return Response.json({ error: "file missing" }, { status: 400 });
      return Response.json(await importInterview(String(form.get("personId") ?? "sabine"), Buffer.from(await file.arrayBuffer()), file.name, file.type || "audio/mpeg"));
    }
    const b = (await req.json()) as { sample?: boolean; personId?: string };
    if (!b.sample) return Response.json({ error: "send a file or { sample: true }" }, { status: 400 });
    const f = path.join(process.cwd(), "public", "demo", "interview-sabine-de.mp3");
    if (!fs.existsSync(f)) return Response.json({ error: "sample recording missing — run pnpm make:interview" }, { status: 404 });
    return Response.json(await importInterview(b.personId ?? "sabine", fs.readFileSync(f), "interview-sabine-de.mp3", "audio/mpeg"));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
