// asky MCP harness — discover an application and generate its domain MCP.
//
//   pnpm harness                      # mock AP app on http://localhost:3210
//   pnpm harness --url http://host --app invoiceshelf --openapi /api/docs.json --start /admin/invoices
//   pnpm harness --no-crawl           # OpenAPI only (no browser)
//   pnpm harness --frappe "Purchase Invoice,Supplier" --url http://localhost:8080 --app erpnext \
//                --start /app/purchase-invoice/ACC-PINV-2026-00006   # ERPNext: metadata instead of OpenAPI, crawl behind login
//
// Output: data/generated/<app>.tools.json, and the catalog is registered with
// the asky server so Capture/Teach map clicks onto these tools.

import fs from "node:fs";
import path from "node:path";
import { alignCatalog, generateCatalog, type CrawlObservation, type OpenAPISpec } from "../src/lib/mcp/generate";
import type { ToolCatalog } from "../src/lib/types";
import { FRAPPE_MUTATION, discoverFrappe, frappeLogin, normalizeFrappeObservation } from "./frappe";

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

  const frappe = arg("frappe");
  console.log(`▶ discovering ${app} at ${baseUrl}`);
  let spec: OpenAPISpec;
  let cookie: string | undefined;
  if (frappe) {
    cookie = await frappeLogin(baseUrl, arg("user", process.env.ERPNEXT_USER || "Administrator")!, arg("password", process.env.ERPNEXT_PASSWORD || "admin")!);
    const found = await discoverFrappe(baseUrl, cookie, frappe.split(",").map((x) => x.trim()));
    spec = found.spec;
    for (const dt of found.doctypes) {
      console.log(`  doctype ${dt.name}${dt.submittable ? " (submittable)" : ""}: ${dt.sections.length} editable sections`);
      if (dt.workflow) console.log(`    workflow "${dt.workflow.name}": ${dt.workflow.transitions.join(" · ")}`);
    }
  } else {
    spec = (await (await fetch(new URL(openapiPath, baseUrl))).json()) as OpenAPISpec;
  }
  const ops = Object.values(spec.paths).reduce((n, m) => n + Object.keys(m).length, 0);
  console.log(`  ${frappe ? "operations from metadata" : "openapi"}: ${ops}`);

  let crawl: CrawlObservation[] = [];
  if (!flag("no-crawl")) {
    try {
      const { crawlApp } = await import("./crawl");
      crawl = await crawlApp(baseUrl, start, {
        log: (s) => console.log("  " + s),
        ...(frappe ? { cookie, follow: false, dropdowns: true, maxPages: start.length, isMutation: (u: string) => FRAPPE_MUTATION.test(u) } : {}),
      });
      if (frappe) crawl = crawl.map(normalizeFrappeObservation);
      console.log(`  crawl: ${crawl.length} observations`);
    } catch (e) {
      console.warn(`  crawl skipped (${(e as Error).message.split("\n")[0]}) — run "pnpm exec playwright install chromium"`);
    }
  }

  const catalog: ToolCatalog = await generateCatalog(app, baseUrl, spec, crawl);
  // another app: line its tools up with the domain vocabulary the knowledge hub already speaks
  const reference = arg("align", app === "ledgerline-ap" ? undefined : "http://localhost:3210/api/harness/catalog");
  if (reference) {
    const ref = (await fetch(reference).then((r) => r.json()).catch(() => null)) as ToolCatalog | null;
    if (ref?.tools?.length) {
      catalog.alignment = await alignCatalog(catalog, ref);
      const found = catalog.alignment.filter((a) => a.tools.length).length;
      console.log(`\n▶ alignment with ${ref.app}: ${found}/${catalog.alignment.length} domain steps found`);
      for (const a of catalog.alignment) console.log(`  ${a.tools.length ? "✔" : "✗"} ${a.canonical.padEnd(22)} ← ${a.tools.join(", ") || "—"}${a.note ? `   (${a.note})` : ""}`);
    }
  }
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
