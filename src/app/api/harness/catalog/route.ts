import { db, mutate } from "@/lib/store";
import type { ToolCatalog } from "@/lib/types";
import { isVisitor, withWorkspace } from "@/lib/workspace";

async function handleGET() {
  return Response.json(db().tools ?? null);
}

async function handlePOST(req: Request) {
  if (isVisitor()) return Response.json({ error: "The harness is presenter-only" }, { status: 403 });
  const { catalog } = (await req.json()) as { catalog: ToolCatalog };
  if (!catalog?.tools?.length) return Response.json({ error: "empty catalog" }, { status: 400 });
  // the mock app's catalog is the domain vocabulary; other apps are kept next to it
  mutate((d) => {
    if (catalog.app === "ledgerline-ap" || !d.tools) d.tools = catalog;
    else (d.catalogs ??= {})[catalog.app] = catalog;
  });
  return Response.json({ ok: true, tools: catalog.tools.length });
}

export const GET = withWorkspace(handleGET);
export const POST = withWorkspace(handlePOST);
