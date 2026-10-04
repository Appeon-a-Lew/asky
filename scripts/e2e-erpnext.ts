// End-to-end on a real application: Sabine works her month-end queue in
// ERPNext; asky only sees her shared screen (vision) and ERPNext's API.
// Playwright plays Sabine (drives the real ERPNext UI) and stands in for
// screen sharing by sending a frame after every step. Answers are typed.
//
//   pnpm e2e:erpnext             # fresh: reset asky's knowledge and the ERPNext queue
//   pnpm e2e:erpnext --keep      # keep what asky learned (it should recognize known situations)
//
// Needs: asky on :3210, ERPNext on :8080 (pnpm seed:erpnext), ANTHROPIC_API_KEY for vision.

import fs from "node:fs";
import { chromium, type Page } from "playwright";
import { answerFor } from "./sabine";

const BASE = process.env.ASKY_URL || "http://localhost:3210";
const ERP = process.env.ERPNEXT_URL || "http://localhost:8080";
const OUT = "e2e-shots/erpnext";
fs.mkdirSync(OUT, { recursive: true });
const keep = process.argv.includes("--keep");

type Q = { id: string; text: string; timing: string; caseId?: string; decision?: { engine: string; latencyMs: number; deviationType: string } };
type Violation = { reason: string; quote?: string; guardrail: { text: string } };
type FrameResult = { block?: { tool?: string; violations?: Violation[] } } & { screen?: { view: string; invoiceRef?: string; costCenter?: string; status?: string; dialog?: string; caption: string } | null; events?: { summary: string; tool?: string }[]; questions?: Q[]; recognized?: { title: string }[]; hold?: { question: Q } };

async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(BASE + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j)}`);
  return j as T;
}

const teach = { blocks: [] as Violation[], predictions: 0 };
const stats = { frames: 0, events: [] as string[], live: [] as Q[], held: [] as Q[], recognized: new Set<string>(), visionMs: [] as number[] };
let sid = "";
let shot = 0;

async function ask(q: Q, how: string) {
  await call("PATCH", `/api/sessions/${sid}/questions/${q.id}`, { status: "asked" });
  await call("POST", `/api/sessions/${sid}/utterances`, { speaker: "agent", text: q.text, ts: Date.now(), questionId: q.id });
  const a = answerFor(q.text);
  await call("POST", `/api/sessions/${sid}/utterances`, { speaker: "expert", text: a, ts: Date.now() + 1, questionId: q.id });
  console.log(`    🗣  [${how}] ${q.text}\n    👩 Sabine: ${a.slice(0, 120)}${a.length > 120 ? "…" : ""}`);
}

/** Screen share: one frame of what Sabine sees now. */
async function frame(page: Page, label: string) {
  await page.waitForTimeout(700);
  const buf = await page.screenshot({ type: "jpeg", quality: 70 });
  fs.writeFileSync(`${OUT}/${String(++shot).padStart(2, "0")}-${label.replace(/\W+/g, "-")}.jpg`, buf);
  const t = Date.now();
  const r = await call<FrameResult>("POST", `/api/sessions/${sid}/frames`, { dataUrl: `data:image/jpeg;base64,${buf.toString("base64")}`, ts: Date.now(), describe: true });
  stats.visionMs.push(Date.now() - t);
  stats.frames++;
  const s = r.screen;
  console.log(`  📸 ${label.padEnd(34)} sees: ${s ? `${s.view}${s.invoiceRef ? ` ${s.invoiceRef}` : ""}${s.costCenter ? ` cc=${s.costCenter}` : ""}${s.status ? ` [${s.status}]` : ""}${s.dialog ? ` dialog="${s.dialog}"` : ""}` : "—"}  (${Date.now() - t} ms)`);
  for (const e of r.events ?? []) {
    stats.events.push(e.summary);
    console.log(`     → ${e.summary}`);
  }
  for (const x of r.recognized ?? []) {
    if (stats.recognized.has(x.title)) continue;
    stats.recognized.add(x.title);
    console.log(`     ✓ already known: ${x.title}`);
  }
  // asked at the next natural pause (in the browser this is the pause detector)
  for (const q of r.questions ?? []) {
    if (q.timing === "debrief") continue;
    stats.live.push(q);
    await ask(q, q.timing === "pre_commit" ? "before commit" : "live");
  }
  if (r.block?.violations?.length) {
    const v = r.block.violations[0];
    teach.blocks.push(v);
    console.log(`    🛑 tutor: Stop — don't click Yes. ${v.guardrail.text}${v.quote ? `\n       Sabine said: "${v.quote.slice(0, 110)}"` : ""}`);
  }
  if (r.hold) {
    stats.held.push(r.hold.question);
    if (!stats.live.some((q) => q.id === r.hold!.question.id)) await ask(r.hold.question, "hold — dialog still open");
  }
  return r;
}

const PI = (name: string) => `${ERP}/app/purchase-invoice/${name}`;
async function open(page: Page, name: string) {
  await page.goto(PI(name), { waitUntil: "networkidle" });
  await page.waitForSelector(".form-layout", { timeout: 15000 });
}
/** Frappe's own client API — what typing into the field and pressing Ctrl+S does. */
async function setAndSave(page: Page, values: Record<string, unknown>) {
  await page.evaluate(async (v) => {
    const frm = (window as unknown as { cur_frm: { set_value: (k: string, x: unknown) => Promise<void>; save: () => Promise<void> } }).cur_frm;
    for (const [k, x] of Object.entries(v)) await frm.set_value(k, x);
  }, values);
  await page.waitForTimeout(400);
}
/** A comment in the form timeline, as typed into the comment box. */
async function comment(page: Page, text: string) {
  await page.evaluate(async (t) => {
    const w = window as unknown as { cur_frm: { doctype: string; docname: string; reload_doc: () => Promise<void> }; frappe: { call: (o: unknown) => Promise<unknown>; session: { user: string } } };
    await w.frappe.call({ method: "frappe.desk.form.utils.add_comment", args: { reference_doctype: w.cur_frm.doctype, reference_name: w.cur_frm.docname, content: t, comment_email: w.frappe.session.user, comment_by: "Sabine Weber" } });
    await w.cur_frm.reload_doc();
  }, text);
  await page.locator(".timeline-content, .comment-content").filter({ hasText: text.slice(0, 20) }).first().scrollIntoViewIfNeeded().catch(() => {});
}

async function save(page: Page) {
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => !(window as unknown as { cur_frm: { is_dirty: () => boolean } }).cur_frm.is_dirty(), null, { timeout: 15000 });
  await page.waitForTimeout(800);
}
async function workflow(page: Page, action: string, label: string): Promise<boolean> {
  await page.getByRole("button", { name: "Actions" }).click();
  await page.locator(".dropdown-menu.show .dropdown-item").filter({ hasText: new RegExp(`^\\s*${action}\\s*$`) }).first().click();
  await page.locator(".modal.show").filter({ hasText: action }).waitFor({ timeout: 5000 });
  const r = await frame(page, `${label} — confirm dialog`); // asky may hold (capture) or stop (teach) here
  if (r.block?.violations?.length) {
    // the learner listens to the tutor and does not confirm
    await page.locator(".modal.show button").filter({ hasText: /^\s*no\s*$/i }).first().click();
    await page.waitForTimeout(600);
    return false;
  }
  await page.locator(".modal.show .btn-primary").filter({ hasText: /yes/i }).click();
  await page.waitForTimeout(1500);
  await page.waitForLoadState("networkidle");
  return true;
}

async function main() {
  const t0 = Date.now();
  const status = await call<{ up: boolean; catalog: { aligned: number; of: number } | null }>("GET", "/api/erpnext");
  if (!status.up) throw new Error(`ERPNext is not reachable at ${ERP}`);
  console.log(`ERPNext up · domain MCP: ${status.catalog ? `${status.catalog.aligned}/${status.catalog.of} steps aligned` : "not generated (pnpm harness --frappe …)"}`);
  if (!keep) await call("POST", "/api/reset");
  await call("POST", "/api/erpnext", { action: "reset" });
  const erp = await call<{ mirror: { open: { id: string; title: string }[] } }>("GET", "/api/erpnext");
  const byRef = Object.fromEntries(erp.mirror.open.map((i) => [i.title.split(" ·")[0], i.id]));

  const s = await call<{ id: string }>("POST", "/api/sessions", { mode: "capture", personId: "sabine", target: "erpnext", title: "Month-end queue in ERPNext (Sabine)" });
  sid = s.id;
  console.log(`\n━━ CAPTURE in ERPNext (session ${sid}) ━━`);

  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" })).newPage();
  await page.goto(`${ERP}/login`);
  await page.fill("#login_email", process.env.ERPNEXT_USER || "Administrator");
  await page.fill("#login_password", process.env.ERPNEXT_PASSWORD || "admin");
  await page.click(".btn-login");
  await page.waitForURL(/\/(app|desk)/);

  await page.goto(`${ERP}/app/purchase-invoice?docstatus=0`, { waitUntil: "networkidle" });
  await frame(page, "inbox");

  // 4469 — routine material, keep the coding, post
  await open(page, byRef["4469"]);
  await frame(page, "open 4469");
  await workflow(page, "Post", "post 4469");
  await frame(page, "4469 posted");

  // 4471 — CNC spindle unit on opex 4711: recode to capex 0400 with an asset number, then post
  await open(page, byRef["4471"]);
  await frame(page, "open 4471");
  await setAndSave(page, { cost_center: "0400 - Machinery & equipment (capex) - KM", asset_number: "AN-2025-0142" });
  await frame(page, "4471 recoded, not saved");
  await save(page);
  await frame(page, "4471 saved");
  await workflow(page, "Post", "post 4471");
  await frame(page, "4471 posted");

  // 4472 — Keller CZ (subsidiary), €3,200: controller approval whatever the amount
  await open(page, byRef["4472"]);
  await frame(page, "open 4472");
  await workflow(page, "Request Approval", "request approval 4472");
  await frame(page, "4472 pending approval");
  await workflow(page, "Approve", "controller approves 4472");
  await frame(page, "4472 approved");
  await workflow(page, "Post", "post 4472");
  await frame(page, "4472 posted");

  // 4473 — Nordlicht, December, same amount as 4468: check the history, hold as duplicate
  await open(page, byRef["4473"]);
  await frame(page, "open 4473");
  await page.goto(`${ERP}/app/purchase-invoice?supplier=${encodeURIComponent("Nordlicht Bürobedarf GmbH")}`, { waitUntil: "networkidle" });
  await frame(page, "Nordlicht history");
  await open(page, byRef["4473"]);
  await comment(page, "Duplicate of 4468 — December double billing. Asked Nordlicht for a credit note.");
  await frame(page, "4473 comment");
  await workflow(page, "Hold", "hold 4473");
  await frame(page, "4473 on hold");

  await browser.close();
  console.log(`\n  frames: ${stats.frames} · vision avg ${Math.round(stats.visionMs.reduce((a, b) => a + b, 0) / stats.visionMs.length)} ms · events: ${stats.events.length} · live questions: ${stats.live.length} · holds before commit: ${stats.held.length}`);

  console.log("\n━━ DEBRIEF ━━");
  const { questions } = await call<{ questions: Q[] }>("POST", `/api/sessions/${sid}/debrief`);
  for (const q of questions) await ask(q, "debrief");

  console.log("\n━━ TEACH-BACK ━━");
  const tb = await call<{ text: string }>("POST", `/api/sessions/${sid}/teachback`, {});
  console.log(`  🗣  ${tb.text}`);
  const done = await call<{ committed: { changed: { title: string; created: boolean; added: string[] }[] } }>("POST", `/api/sessions/${sid}/teachback`, { confirmed: true });
  console.log("  👩 Sabine: Yes, that's how it works.");
  for (const c of done.committed.changed) console.log(`  📄 ${c.created ? "new" : "updated"}: ${c.title}`);

  console.log("\n━━ TEACH in ERPNext: Lena, cases Sabine never showed ━━");
  await call("POST", "/api/erpnext", { action: "training" });
  const tr = await call<{ mirror: { open: { id: string; title: string }[] } }>("GET", "/api/erpnext");
  const ref = Object.fromEntries(tr.mirror.open.map((i) => [i.title.split(" ·")[0], i.id]));
  const t = await call<{ id: string }>("POST", "/api/sessions", { mode: "teach", personId: "lena", target: "erpnext", title: "Training in ERPNext · Lena Hoffmann" });
  sid = t.id;
  const lena = await (await chromium.launch()).newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" }).then((c) => c.newPage());
  await lena.goto(`${ERP}/login`);
  await lena.fill("#login_email", process.env.ERPNEXT_USER || "Administrator");
  await lena.fill("#login_password", process.env.ERPNEXT_PASSWORD || "admin");
  await lena.click(".btn-login");
  await lena.waitForURL(/\/(app|desk)/);
  const predict = async (caseId: string, answer: string) => {
    const p = await call<{ pageId: string; question: string } | null>("GET", `/api/teach/predict?caseId=${caseId}`);
    if (!p) return;
    teach.predictions++;
    const j = await call<{ correct: boolean; feedback: string }>("POST", "/api/teach/judge", { sessionId: sid, pageId: p.pageId, answer });
    console.log(`    🎓 tutor: ${p.question}\n    🙋 Lena: ${answer}\n    🎓 ${j.correct ? "✔" : "✗"} ${j.feedback.slice(0, 140)}`);
  };

  // 5101 — new supplier, hydraulic press tool set €6,400, pre-coded opex: Lena tries to post it as is
  await open(lena, ref["5101"]);
  await frame(lena, "Lena opens 5101");
  await predict(ref["5101"], "I would just post it, the cost center is already filled in.");
  const posted5101 = await workflow(lena, "Post", "Lena posts 5101 on opex");
  if (!posted5101) {
    await setAndSave(lena, { cost_center: "0400 - Machinery & equipment (capex) - KM", asset_number: "AN-2025-0177" });
    await save(lena);
    await frame(lena, "Lena recodes 5101 to capex");
    await workflow(lena, "Post", "Lena posts 5101 after recoding");
  }
  // 5102 — Keller CZ, €2,080: Lena tries to post without controller approval
  await open(lena, ref["5102"]);
  await frame(lena, "Lena opens 5102");
  await workflow(lena, "Post", "Lena posts 5102 without approval");
  await lena.context().browser()?.close();
  const fin = await call<{ mastery: { title: string; level: string }[]; caught: unknown[] }>("POST", "/api/teach/finish", { sessionId: sid });
  console.log(`  caught before saving: ${fin.caught.length} · mastery: ${fin.mastery.map((m) => `${m.level === "mastered" ? "✅" : m.level === "practicing" ? "🟡" : "⚪"} ${m.title.slice(0, 50)}`).join(" | ")}`);

  const problems: string[] = [];
  if (teach.blocks.length < 1) problems.push("the tutor caught no wrong decision before it was saved (brief requires ≥ 1)");
  const need: [RegExp, string][] = [[/opened invoice 4471/, "saw 4471 opened"], [/4471: cost center 4711 → 0400/, "saw the recoding"], [/sent invoice 4472/, "saw the approval request"], [/posted invoice 4471/, "saw 4471 posted"], [/on hold/, "saw the hold"], [/history of supplier Nordlicht/, "saw the supplier history check"]];
  for (const [re, what] of need) if (!stats.events.some((e) => re.test(e))) problems.push(`vision never ${what}`);
  if (!keep && stats.live.length < 3) problems.push(`only ${stats.live.length} live questions (brief requires ≥ 3)`);
  if (!keep && questions.length < 3) problems.push(`only ${questions.length} debrief questions (brief requires ≥ 3)`);
  console.log(`\n${problems.length ? `✗ ${problems.join("\n✗ ")}` : "✔ ERPNext e2e passed"} · ${Math.round((Date.now() - t0) / 1000)} s · Work Map: ${BASE}/hub/sessions/${sid} · frames in ${OUT}/`);
  if (problems.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
