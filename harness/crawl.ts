import { chromium, type Page, type Request } from "playwright";
import type { CrawlObservation } from "../src/lib/mcp/generate";

// Safe UI crawl: clicks every control, fills dialogs, records which HTTP
// request each control triggers. Mutating requests are intercepted and
// answered with a fake 200, so the crawl never changes application data.

export interface CrawlOptions {
  apiPrefix?: string;
  log?: (s: string) => void;
  cookie?: string; // session cookie for apps behind a login ("a=1; b=2")
  follow?: boolean; // follow in-app links (default true; desk apps link to everything)
  maxPages?: number;
  /** which non-GET requests change data; others (search, load…) pass through. Default: every non-GET */
  isMutation?: (url: string) => boolean;
  /** also open dropdown menus a button reveals and click each item (workflow "Actions", "Create" …) */
  dropdowns?: boolean;
}

export async function crawlApp(baseUrl: string, startPaths: string[], opts: CrawlOptions = {}): Promise<CrawlObservation[]> {
  const log = opts.log ?? (() => {});
  const apiPrefix = opts.apiPrefix ?? "/api/";
  const browser = await chromium.launch();
  const context = await browser.newContext();
  if (opts.cookie) {
    const host = new URL(baseUrl).hostname;
    await context.addCookies(opts.cookie.split(/;\s*/).filter(Boolean).map((c) => {
      const [name, ...v] = c.split("=");
      return { name, value: v.join("="), domain: host, path: "/" };
    }));
  }
  const observations: CrawlObservation[] = [];
  let current = { page: "", uiLabel: "(page load)", confirmText: undefined as string | undefined };

  await context.route(`**${apiPrefix}**`, async (route) => {
    const req = route.request();
    if (req.method() === "GET" || (opts.isMutation && !opts.isMutation(req.url()))) return route.continue();
    let body: unknown;
    const raw = req.postData() ?? "";
    try {
      body = JSON.parse(raw);
    } catch {
      body = /^[\w.%-]+=/.test(raw) ? Object.fromEntries(new URLSearchParams(raw)) : raw; // form-encoded (Frappe desk)
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

  while (queue.length && visited.size < (opts.maxPages ?? 6)) {
    const url = queue.shift()!;
    const key = new URL(url).pathname.replace(/\/\d+(?=\/|$)/g, "/{id}");
    if (visited.has(key)) continue;
    visited.add(key);
    log(`page ${new URL(url).pathname}`);
    current = { page: key, uiLabel: "(page load)", confirmText: undefined };
    await page.goto(url, { waitUntil: "networkidle" });

    // discover in-app links (one per route shape)
    if (opts.follow !== false) {
      const links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
      for (const l of links) if (l.startsWith(baseUrl) && !queue.includes(l)) queue.push(l);
    }

    const labels = await buttonLabels(page);
    for (const label of labels) {
      current = { page: key, uiLabel: "(page load)", confirmText: undefined };
      await page.goto(url, { waitUntil: "networkidle" });
      const btn = page.locator("button:not([disabled]), [role=tab]").filter({ hasText: label }).first();
      if (!(await btn.count())) continue;
      current = { page: key, uiLabel: label, confirmText: undefined };
      await btn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(250);
      const items = opts.dropdowns ? await menuItems(page) : [];
      if (!items.length) {
        await confirmDialog(page, label, (c) => (current = { page: key, ...c }));
        await page.waitForLoadState("networkidle").catch(() => {});
        continue;
      }
      for (const item of items) {
        await page.goto(url, { waitUntil: "networkidle" });
        await btn.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(250);
        const el = page.locator(".dropdown-menu.show .dropdown-item, [role=menu] [role=menuitem]").filter({ hasText: item }).first();
        if (!(await el.count())) continue;
        current = { page: key, uiLabel: `${label} → ${item}`, confirmText: undefined };
        await el.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(300);
        await confirmDialog(page, `${label} → ${item}`, (c) => (current = { page: key, ...c }));
        await page.waitForLoadState("networkidle").catch(() => {});
      }
    }
  }
  await browser.close();
  return observations;
}

/** A confirm / input dialog in front: fill it, remember its text, press its primary button. */
async function confirmDialog(page: Page, label: string, set: (c: { uiLabel: string; confirmText: string | undefined }) => void) {
  const dialog = page.locator("[role=dialog]:visible, [role=alertdialog]:visible").first();
  if (!(await dialog.count())) return;
  const text = (await dialog.innerText()).replace(/\s+/g, " ").trim();
  for (const f of await dialog.locator("textarea, input[type=text], input:not([type])").all()) await f.fill("crawler probe").catch(() => {});
  const primary = dialog.locator("button.btn-primary:visible").first().or(dialog.locator("button:visible").last());
  const primaryLabel = (await primary.first().innerText().catch(() => "")).trim();
  set({ uiLabel: `${label} → ${primaryLabel}`, confirmText: text });
  await primary.first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(300);
}

async function menuItems(page: Page): Promise<string[]> {
  const raw = await page.$$eval(".dropdown-menu.show .dropdown-item, [role=menu] [role=menuitem]", (els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => (e.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean));
  return [...new Set(raw)];
}

async function buttonLabels(page: Page): Promise<string[]> {
  const raw = await page.$$eval("button:not([disabled]), [role=tab]", (bs) => bs.map((b) => (b.textContent || "").trim()).filter(Boolean));
  return [...new Set(raw)].filter((l) => !/^(cancel|close)$/i.test(l));
}
