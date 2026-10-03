// asky MCP harness — discover an application and generate its domain MCP.
//
//   pnpm harness                      # mock AP app on http://localhost:3210
//   pnpm harness --url http://host --app invoiceshelf --openapi /api/docs.json --start /admin/invoices
//   pnpm harness --no-crawl           # OpenAPI only (no browser)
//
// Output: data/generated/<app>.tools.json, and the catalog is registered with
// the asky server so Capture/Teach map clicks onto these tools.

import fs from "node:fs";
import path from "node:path";
import { generateCatalog, type CrawlObservation, type OpenAPISpec } from "../src/lib/mcp/generate";

function arg(name: string, def?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const baseUrl = arg("url", "http://localhost:3210")!;
  const app = arg("app", "ledgerline-ap")!;
  const openapiPath = arg("openapi", "/api/ap/openapi.json")!;
  const start = (arg("start", "/app") ?? "/app").split(",");
  const server = arg("asky", "http://localhost:3210")!;

  console.log(`▶ discovering ${app} at ${baseUrl}`);
  const spec = (await (await fetch(new URL(openapiPath, baseUrl))).json()) as OpenAPISpec;
  const ops = Object.values(spec.paths).reduce((n, m) => n + Object.keys(m).length, 0);
  console.log(`  openapi: ${ops} operations`);

  let crawl: CrawlObservation[] = [];
  if (!flag("no-crawl")) {
    try {
      const { crawlApp } = await import("./crawl");
      crawl = await crawlApp(baseUrl, start, { log: (s) => console.log("  " + s) });
      console.log(`  crawl: ${crawl.length} observations`);
    } catch (e) {
      console.warn(`  crawl skipped (${(e as Error).message.split("\n")[0]}) — run "pnpm exec playwright install chromium"`);
    }
  }

  const catalog = await generateCatalog(app, baseUrl, spec, crawl);
  const outDir = path.join(process.cwd(), "data", "generated");
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${app}.tools.json`);
  fs.writeFileSync(out, JSON.stringify({ catalog, crawl }, null, 2));
  console.log(`\n✔ ${catalog.tools.length} tools (${catalog.generator}) → ${path.relative(process.cwd(), out)}`);
  for (const t of catalog.tools) console.log(`  ${t.effect.padEnd(12)} ${t.name.padEnd(22)} ${t.title}${t.uiLabels.length ? `  [ui: ${t.uiLabels.join(" | ")}]` : ""}`);

  try {
    const r = await fetch(new URL("/api/harness/catalog", server), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catalog, crawl }) });
    console.log(r.ok ? `✔ registered with asky at ${server}` : `✗ register failed: HTTP ${r.status}`);
  } catch {
    console.log(`(asky server not reachable at ${server}; catalog only written to disk)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
