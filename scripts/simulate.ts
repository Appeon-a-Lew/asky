// End-to-end simulation through the real HTTP API (no browser, no voice):
// Sabine processes 6 invoices with live questions → debrief → teach-back →
// knowledge committed; then Lena works unseen training cases and the tutor
// must stop wrong decisions before they are saved.
//
//   pnpm simulate            # against http://localhost:3210
//   pnpm simulate --keep     # don't reset first

const BASE = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : "http://localhost:3210";

type Q = { id: string; text: string; timing: string; kind: string; caseId?: string; importance: number; decision?: { engine: string; action: string; latencyMs: number; deviationType: string; fellBack?: string } };

async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(BASE + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !path.startsWith("/api/ap/")) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j)}`);
  return j as T;
}

let clock = Date.now();
const tick = (s: number) => (clock += s * 1000);

// Answers Sabine gives, keyed by what the question is about.
const SABINE: [RegExp, string][] = [
  [/0400|capex|moved invoice 4471|4471.*(change|moved)/i, "That's a spindle unit — equipment. Equipment over 5,000 euros is always capex, so it goes to 0400, not maintenance. And no asset number, no capex booking: I get the number from the fixed-asset team first."],
  [/approval|10,000|ten thousand|Fischer|4472/i, "Everything from our Czech subsidiary goes to Dr. Fischer in controlling for a second approval, no matter the amount — transfer pricing. I never post intercompany without the controller."],
  [/history|Nordlicht|4473/i, "Nordlicht double-bills every December. The 4473 has exactly the same amount as 4468 from the second, so it is a duplicate — I put it on hold and ask them for a credit note."],
  [/without|cost center|coding|safe/i, "If the line category matches the pre-coded cost center, like freight on 4800 or cleaning on 4720, I leave it. I only touch the coding when it doesn't fit."],
  [/never seen|new supplier|unknown/i, "A supplier I have never seen with equipment that expensive — I stop and ask the controller before booking anything."],
  [/wrong|month-end|goes wrong/i, "The classic is posting fails because the approval is still pending. Then you check the workflow box and chase the approver — for Fischer, a call works faster than email."],
  [/order/i, "The order doesn't matter there, as long as both happen before posting."],
  [/stop and ask|would not|exception/i, "If the amount is above 50,000 euros I always involve the CFO, whatever the cost center."],
];
const answerFor = (q: string) => SABINE.find(([re]) => re.test(q))?.[1] ?? "I just know it from experience — it's how we've always done it.";

const bridge = (method: string, path: string, body: unknown, status: number, response: Record<string, unknown>) => ({ type: "asky:api", method, path, body, status, ok: status < 400, response, ts: tick(4) });

async function apCall(sessionId: string, method: "GET" | "POST" | "PATCH", path: string, body?: unknown, opts: { gate?: boolean } = {}) {
  if (method !== "GET" && opts.gate !== false) {
    const g = await call<{ allow: boolean; hold?: { question: Q }; violations?: { reason: string; quote?: string; guardrail: { text: string } }[]; message?: string }>("POST", `/api/sessions/${sessionId}/gate`, { method, path, body });
    if (!g.allow) return { held: g };
  }
  const r = await fetch(BASE + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = (await r.json()) as Record<string, unknown>;
  const res = await call<{ questions: Q[] }>("POST", `/api/sessions/${sessionId}/events`, { msgs: [bridge(method, path, body, r.status, json)] });
  return { status: r.status, json, questions: res.questions };
}

async function askAndAnswer(sid: string, q: Q, who = "Sabine") {
  await call("PATCH", `/api/sessions/${sid}/questions/${q.id}`, { status: "asked" });
  await call("POST", `/api/sessions/${sid}/utterances`, { speaker: "agent", text: q.text, ts: tick(2), questionId: q.id });
  const a = answerFor(q.text);
  await call("POST", `/api/sessions/${sid}/utterances`, { speaker: "expert", text: a, ts: tick(8), questionId: q.id });
  console.log(`    🗣  ${q.text}\n    👩 ${who}: ${a.slice(0, 110)}${a.length > 110 ? "…" : ""}`);
}

async function expertSession() {
  console.log("\n━━ CAPTURE: Sabine works her queue ━━");
  const s = await call<{ id: string }>("POST", "/api/sessions", { mode: "capture", personId: "sabine", title: "Month-end queue (Sabine)" });
  const sid = s.id;
  const live: Q[] = [];
  const handle = async (res: { questions?: Q[]; held?: unknown }) => {
    for (const q of res.questions ?? []) {
      const d = q.decision;
      console.log(`  ⚡ ${d?.deviationType} → ${d?.action} (${d?.engine}, ${d?.latencyMs}ms${d?.fellBack ? `, ${d.fellBack}` : ""}) imp=${q.importance}`);
      if (q.timing !== "debrief") {
        live.push(q);
        await askAndAnswer(sid, q);
      } else console.log(`    ⏳ queued for debrief: ${q.text}`);
    }
  };
  const step = async (label: string, method: "GET" | "POST" | "PATCH", path: string, body?: unknown) => {
    const r = await apCall(sid, method, path, body);
    if ("held" in r) {
      console.log(`  ⏸ ${label}: HELD → ${(r.held as { hold?: { question: Q } }).hold?.question.text}`);
      const q = (r.held as { hold?: { question: Q } }).hold?.question;
      if (q) await askAndAnswer(sid, q);
      return apCall(sid, method, path, body, { gate: false }).then(handle);
    }
    console.log(`  · ${label} (${r.status})`);
    await handle(r);
  };

  await step("open 4469", "GET", "/api/ap/invoices/4469");
  await step("save coding 4469 (kept)", "PATCH", "/api/ap/invoices/4469/coding", { costCenter: "4711", assetNumber: "" });
  await step("post 4469", "POST", "/api/ap/invoices/4469/post");

  await step("open 4470", "GET", "/api/ap/invoices/4470");
  await step("post 4470", "POST", "/api/ap/invoices/4470/post");

  await step("open 4471", "GET", "/api/ap/invoices/4471");
  await step("recode 4471 → 0400", "PATCH", "/api/ap/invoices/4471/coding", { costCenter: "0400", assetNumber: "AN-2025-0142" });
  await step("post 4471", "POST", "/api/ap/invoices/4471/post");

  await step("open 4472", "GET", "/api/ap/invoices/4472");
  await step("approval 4472 → controller", "POST", "/api/ap/invoices/4472/approval-requests", { approver: "Dr. M. Fischer", role: "controller", reason: "Intercompany CZ" });
  await step("approval received 4472", "POST", "/api/ap/invoices/4472/approve", { approver: "Dr. M. Fischer" });
  await step("post 4472", "POST", "/api/ap/invoices/4472/post");

  await step("open 4473", "GET", "/api/ap/invoices/4473");
  await step("supplier history Nordlicht", "GET", "/api/ap/suppliers/SUP-NRD/invoices");
  await step("hold 4473", "POST", "/api/ap/invoices/4473/hold", { reason: "Duplicate of 4468 — December double billing" });
  await step("note 4473", "POST", "/api/ap/invoices/4473/notes", { text: "Asked Nordlicht for a credit note" });

  await step("open 4474", "GET", "/api/ap/invoices/4474");
  await step("post 4474", "POST", "/api/ap/invoices/4474/post");

  console.log(`\n  live questions asked: ${live.length}`);

  console.log("\n━━ DEBRIEF ━━");
  const { questions } = await call<{ questions: Q[] }>("POST", `/api/sessions/${sid}/debrief`);
  for (const q of questions) await askAndAnswer(sid, q);
  console.log(`  debrief questions: ${questions.length}`);

  console.log("\n━━ TEACH-BACK ━━");
  const tb = await call<{ text: string; situations: number; by: string }>("POST", `/api/sessions/${sid}/teachback`, {});
  console.log(`  🗣  ${tb.text}\n  (${tb.situations} situations, ${tb.by})`);
  const done = await call<{ committed: { changed: { title: string; created: boolean; added: string[] }[]; lessons: string[] } }>("POST", `/api/sessions/${sid}/teachback`, { confirmed: true });
  console.log("  👩 Sabine: Yes, that's how it works.");
  for (const c of done.committed.changed) console.log(`  📄 ${c.created ? "new" : "updated"}: ${c.title}`);
  console.log(`  📚 lessons regenerated: ${done.committed.lessons.length}`);
  return sid;
}

async function teachSession() {
  console.log("\n━━ TEACH: Lena on cases Sabine never showed ━━");
  const s = await call<{ id: string }>("POST", "/api/sessions", { mode: "teach", personId: "lena", trainingCaseIds: ["5101", "5102", "5103"] });
  const sid = s.id;
  const tryStep = async (label: string, method: "GET" | "POST" | "PATCH", path: string, body?: unknown) => {
    const r = await apCall(sid, method, path, body);
    if ("held" in r) {
      const v = (r.held as { violations: { reason: string; quote?: string; guardrail: { text: string } }[] }).violations[0];
      console.log(`  🛑 ${label}: BLOCKED — ${v.guardrail.text} (${v.reason})\n     💬 Sabine: "${v.quote?.slice(0, 100)}…"`);
      return false;
    }
    console.log(`  ✓ ${label} (${r.status})`);
    return true;
  };
  await tryStep("open 5101 (new supplier, press tools €6,400)", "GET", "/api/ap/invoices/5101");
  await tryStep("post 5101 as opex", "POST", "/api/ap/invoices/5101/post");
  await tryStep("recode 5101 → 0400 without asset no.", "PATCH", "/api/ap/invoices/5101/coding", { costCenter: "0400", assetNumber: "" });
  await tryStep("post 5101", "POST", "/api/ap/invoices/5101/post");

  await tryStep("open 5102 (Keller CZ)", "GET", "/api/ap/invoices/5102");
  await tryStep("post 5102", "POST", "/api/ap/invoices/5102/post");

  await tryStep("open 5103 (Nordlicht, December, €640)", "GET", "/api/ap/invoices/5103");
  await tryStep("post 5103 without checking", "POST", "/api/ap/invoices/5103/post");
  await tryStep("check Nordlicht history", "GET", "/api/ap/suppliers/SUP-NRD/invoices");
  await tryStep("post 5103 after check", "POST", "/api/ap/invoices/5103/post");
  return sid;
}

async function main() {
  if (!process.argv.includes("--keep")) await call("POST", "/api/reset");
  const cat = await call("GET", "/api/harness/catalog");
  if (!cat) throw new Error("No MCP catalog registered — run `pnpm harness` first");
  await expertSession();
  const k = await call<{ pages: { title: string; guardrails: { text: string; rule?: unknown }[]; version: number; status: string }[]; graph: { nodes: unknown[]; edges: unknown[]; version: number }; lessons: { title: string }[] }>("GET", "/api/knowledge");
  console.log(`\n━━ KNOWLEDGE HUB ━━\n  pages: ${k.pages.length}, graph v${k.graph.version} (${k.graph.nodes.length} nodes, ${k.graph.edges.length} edges), lessons: ${k.lessons.length}`);
  for (const p of k.pages) console.log(`  • [${p.status} v${p.version}] ${p.title}\n      ${p.guardrails.map((g) => `${g.rule ? "⚙" : "·"} ${g.text}`).join("\n      ")}`);
  await teachSession();
  console.log("\n✔ simulation complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
