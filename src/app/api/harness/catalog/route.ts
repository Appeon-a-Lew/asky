import { db, mutate } from "@/lib/store";
import type { ToolCatalog } from "@/lib/types";

export async function GET() {
  return Response.json(db().tools ?? null);
}

export async function POST(req: Request) {
  const { catalog } = (await req.json()) as { catalog: ToolCatalog };
  if (!catalog?.tools?.length) return Response.json({ error: "empty catalog" }, { status: 400 });
  mutate((d) => {
    d.tools = catalog;
  });
  return Response.json({ ok: true, tools: catalog.tools.length });
}
