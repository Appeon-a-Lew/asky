// Browser smoke test of the full UI loop (typed answers instead of voice).
//   pnpm e2e            # dev server must run on :3210, catalog generated
// Screenshots go to ./e2e-shots

import fs from "node:fs";
import { chromium, type Frame, type Page } from "playwright";

const BASE = process.env.ASKY_URL || "http://localhost:3210";
const OUT = "e2e-shots";
fs.mkdirSync(OUT, { recursive: true });
const errors: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function app(page: Page): Promise<Frame> {
  for (let k = 0; k < 50; k++) {
    const f = page.frames().find((x) => x.url().includes("/app"));
    if (f) return f;
    await sleep(100);
  }
  throw new Error("app iframe not found");
}

async function answer(page: Page, text: string) {
  const input = page.getByPlaceholder(/Type your answer|Say something to asky|Type your prediction|Ask your tutor/);
  await input.fill(text);
  await input.press("Enter");
}

async function waitForQuestion(page: Page, timeout = 15000) {
  await page.getByText("Listening for your answer").waitFor({ timeout });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on("console", (m) => m.type() === "error" && errors.push(`[console] ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
  page.on("response", (r) => r.status() >= 500 && errors.push(`[${r.status()}] ${r.url()}`));

  await fetch(`${BASE}/api/reset`, { method: "POST" });

  // ── Capture ──
  await page.goto(`${BASE}/capture?voice=browser`);
  await page.getByRole("button", { name: "Start session" }).click();
  let f = await app(page);
  await f.getByRole("link", { name: "4471" }).click();
  f = await app(page);
  await f.locator("select[name=costCenter]").selectOption("0400");
  await f.locator("input[name=assetNumber]").fill("AN-2025-0142");
  await f.getByRole("button", { name: "Save coding" }).click();
  await waitForQuestion(page);
  await page.screenshot({ path: `${OUT}/1-capture-question.png` });
  await answer(page, "Equipment over 5,000 euros is always capex. And no asset number, no capex booking.");
  await sleep(3500);
  await f.getByRole("button", { name: "Post invoice" }).click();
  await f.getByRole("button", { name: "Post now" }).click();
  await sleep(1500);

  await f.getByRole("link", { name: "← Inbox" }).click();
  f = await app(page);
  await f.getByRole("link", { name: "4472" }).click();
  f = await app(page);
  await f.getByRole("button", { name: "Request approval…" }).click();
  await f.locator("select[name=approver]").selectOption("1");
  await f.getByRole("button", { name: "Send" }).click();
  await waitForQuestion(page);
  await answer(page, "Everything from our Czech subsidiary needs controller approval, no matter the amount.");
  await sleep(3500);
  await page.screenshot({ path: `${OUT}/2-capture-after-answers.png` });

  // ── Debrief + teach-back ──
  await page.getByRole("button", { name: /End task/ }).click();
  for (let k = 0; k < 8; k++) {
    const tb = page.getByRole("button", { name: /Yes, that's how it works/ });
    if (await tb.isVisible().catch(() => false)) break;
    try {
      await waitForQuestion(page, 20000);
    } catch {
      break;
    }
    if (await tb.isVisible().catch(() => false)) break;
    await answer(page, "If the supplier is new and the amount is large, I stop and ask the controller.");
    await sleep(3200);
  }
  await page.getByRole("button", { name: /Yes, that's how it works/ }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${OUT}/3-teachback.png` });
  await page.getByRole("button", { name: /Yes, that's how it works/ }).click();
  await page.getByText("Saved to the knowledge hub").waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${OUT}/4-saved.png` });
  const workMap = await page.getByRole("link", { name: /Open Work Map/ }).getAttribute("href");

  // ── Hub ──
  for (const [k, path] of [["5-hub", "/hub"], ["6-pages", "/hub/pages"], ["7-graph", "/hub/graph"], ["8-workmap", workMap!], ["9-docs", "/hub/docs"], ["10-people", "/hub/people"], ["11-tools", "/hub/tools"], ["12-lessons", "/hub/lessons"]] as const) {
    const r = await page.goto(`${BASE}${path}`);
    if (!r || r.status() >= 400) errors.push(`[${r?.status()}] ${path}`);
    await sleep(800);
    await page.screenshot({ path: `${OUT}/${k}.png`, fullPage: true });
  }
  await page.goto(`${BASE}/hub/pages`);
  await page.locator("a[href^='/hub/pages/P-']").first().click();
  await sleep(800);
  await page.screenshot({ path: `${OUT}/13-page.png`, fullPage: true });

  // ── Teach ──
  await page.goto(`${BASE}/teach?voice=browser`);
  await page.getByRole("button", { name: "Start training" }).click();
  f = await app(page);
  await f.getByRole("link", { name: "5101" }).click();
  f = await app(page);
  await page.getByText("Your prediction?").waitFor({ timeout: 15000 }).catch(() => errors.push("[teach] no prediction prompt"));
  await answer(page, "Post it to maintenance");
  await sleep(2500);
  await f.getByRole("button", { name: "Post invoice" }).click();
  await f.getByRole("button", { name: "Post now" }).click();
  await page.getByText("Stopped before saving").first().waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}/14-teach-blocked.png` });
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByText("Your progress").waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}/15-teach-progress.png` });

  await browser.close();
  console.log(errors.length ? `✗ ${errors.length} problems:\n${errors.join("\n")}` : "✔ UI e2e passed");
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  console.error(errors.join("\n"));
  process.exit(1);
});
