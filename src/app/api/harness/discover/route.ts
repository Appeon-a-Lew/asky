import { generateCatalog, type OpenAPISpec } from "@/lib/mcp/generate";
import { db, mutate } from "@/lib/store";
import { isVisitor, withWorkspace } from "@/lib/workspace";

// Server-side rediscovery from the OpenAPI spec (no browser crawl). The full
// harness with UI crawl is `pnpm harness`; this keeps crawl evidence if present.
async function handlePOST(req: Request) {
  if (isVisitor()) return Response.json({ error: "The harness is presenter-only" }, { status: 403 });
  const origin = new URL(req.url).origin;
  const spec = (await (await fetch(`${origin}/api/ap/openapi.json`)).json()) as OpenAPISpec;
  const prev = db().tools;
  const catalog = await generateCatalog("ledgerline-ap", origin, spec, []);
  if (prev) for (const t of catalog.tools) {
    const old = prev.tools.find((x) => x.name === t.name);
    if (old) { t.uiLabels = old.uiLabels; t.evidence = [...new Set([...t.evidence, ...old.evidence.filter((e) => e.startsWith("ui:"))])]; if (old.effect === "irreversible") t.effect = "irreversible"; }
  }
  mutate((d) => (d.tools = catalog));
  return Response.json(catalog);
}

export const POST = withWorkspace(handlePOST);
