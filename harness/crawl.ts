import { chromium, type Page, type Request } from "playwright";
import type { CrawlObservation } from "../src/lib/mcp/generate";

// Safe UI crawl: clicks every control, fills dialogs, records which HTTP
// request each control triggers. Mutating requests are intercepted and
// answered with a fake 200, so the crawl never changes application data.

export async function crawlApp(baseUrl: string, startPaths: string[], opts: { apiPrefix?: string; log?: (s: string) => void } = {}): Promise<CrawlObservation[]> {
  const log = opts.log ?? (() => {});
  const apiPrefix = opts.apiPrefix ?? "/api/";
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const observations: CrawlObservation[] = [];
  let current = { page: "", uiLabel: "(page load)", confirmText: undefined as string | undefined };

  await context.route(`**${apiPrefix}**`, async (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.continue();
    let body: unknown;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    observations.push({ ...current, method: req.method(), url: req.url(), body });
    log(`  ✋ intercepted ${req.method()} ${new URL(req.url()).pathname}  ← "${current.uiLabel}"`);
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  const onRequest = (req: Request) => {
    if (req.method() !== "GET" || !req.url().includes(apiPrefix)) return;
    observations.push({ ...current, method: "GET", url: req.url() });
  };

  const page = await context.newPage();
  page.on("request", onRequest);

  const visited = new Set<string>();
  const queue = startPaths.map((p) => new URL(p, baseUrl).toString());

  while (queue.length && visited.size < 6) {
    const url = queue.shift()!;
    const key = new URL(url).pathname.replace(/\/\d+(?=\/|$)/g, "/{id}");
    if (visited.has(key)) continue;
    visited.add(key);
    log(`page ${new URL(url).pathname}`);
    current = { page: key, uiLabel: "(page load)", confirmText: undefined };
    await page.goto(url, { waitUntil: "networkidle" });

    // discover in-app links (one per route shape)
    const links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
    for (const l of links) if (l.startsWith(baseUrl) && !queue.includes(l)) queue.push(l);

    const labels = await buttonLabels(page);
    for (const label of labels) {
      current = { page: key, uiLabel: "(page load)", confirmText: undefined };
      await page.goto(url, { waitUntil: "networkidle" });
      const btn = page.locator("button:not([disabled]), [role=tab]").filter({ hasText: label }).first();
      if (!(await btn.count())) continue;
      current = { page: key, uiLabel: label, confirmText: undefined };
      await btn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(250);
      const dialog = page.locator("[role=dialog], [role=alertdialog]").first();
      if (await dialog.count()) {
        const text = (await dialog.innerText()).replace(/\s+/g, " ").trim();
        for (const f of await dialog.locator("textarea, input[type=text], input:not([type])").all()) await f.fill("crawler probe").catch(() => {});
        const actions = dialog.locator("button");
        const n = await actions.count();
        const primary = actions.nth(n - 1);
        const primaryLabel = (await primary.innerText()).trim();
        current = { page: key, uiLabel: `${label} → ${primaryLabel}`, confirmText: text };
        await primary.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(300);
      }
      await page.waitForLoadState("networkidle").catch(() => {});
    }
  }
  await browser.close();
  return observations;
}

async function buttonLabels(page: Page): Promise<string[]> {
  const raw = await page.$$eval("button:not([disabled]), [role=tab]", (bs) => bs.map((b) => (b.textContent || "").trim()).filter(Boolean));
  return [...new Set(raw)].filter((l) => !/^(cancel|close)$/i.test(l));
}
