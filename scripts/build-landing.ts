// Build the landing page's data from real runs — nothing on the page is made up.
//
//   pnpm landing            # data from the presenter workspace (data/db.json) + the ERPNext e2e frames
//   pnpm landing --vision   # also re-read the 27 ERPNext frames with asky's vision (Claude, ~27 calls)
//
// Writes public/landing/data.json and public/landing/erpnext/*.jpg (committed: the image has no data/).

import fs from "node:fs";
import path from "node:path";
import { readScreen } from "../src/lib/erpnext/observe";
import { db } from "../src/lib/store";
import type { ScreenState } from "../src/lib/types";

async function main() {
  const OUT = "public/landing";
  const SHOTS = "e2e-shots/erpnext";
  const d = db();

  // ── 1. ERPNext frames (the e2e run: Sabine works the queue, Lena is stopped twice) ──
  fs.mkdirSync(`${OUT}/erpnext`, { recursive: true });
  const prev = fs.existsSync(`${OUT}/data.json`) ? (JSON.parse(fs.readFileSync(`${OUT}/data.json`, "utf8")) as { frames?: { file: string; screen?: ScreenState }[] }) : {};
  const frames: { file: string; title: string; screen?: Partial<ScreenState> }[] = [];
  let last: ScreenState | undefined;
  for (const f of fs.readdirSync(SHOTS).filter((x) => x.endsWith(".jpg")).sort()) {
    fs.copyFileSync(path.join(SHOTS, f), path.join(OUT, "erpnext", f));
    const title = f.replace(/^\d+-/, "").replace(/\.jpg$/, "").replace(/-/g, " ");
    let screen = prev.frames?.find((x) => x.file === f)?.screen;
    if (process.argv.includes("--vision")) {
      const data = fs.readFileSync(path.join(SHOTS, f)).toString("base64");
      const st = await readScreen(`data:image/jpeg;base64,${data}`, last);
      if (st) {
        last = st;
        screen = st;
      }
      console.log(`  ${f}: ${st ? `${st.view} ${st.invoiceRef ?? ""} cc=${st.costCenter ?? ""} ${st.dialog ? `dialog="${st.dialog}"` : ""}` : "no reading"}`);
    }
    const { app, view, invoiceRef, costCenter, assetNumber, status, dialog, supplier, caption } = (screen ?? {}) as ScreenState;
    frames.push({ file: f, title, screen: screen ? { app, view, invoiceRef, costCenter, assetNumber, status, dialog, supplier, caption } : undefined });
  }

  // ── 2. Interrupt decisions (Jev, with the rule scorer as safety net) ──
  const questions = d.sessions.flatMap((s) => s.questions.map((q) => ({ q, s })));
  const pick = (pred: (x: (typeof questions)[number]) => boolean) => questions.find(pred);
  const toDecision = (x?: (typeof questions)[number]) =>
    x && {
      engine: x.q.decision!.engine,
      action: x.q.decision!.action,
      probabilities: x.q.decision!.probabilities,
      confidence: x.q.decision!.confidence,
      latencyMs: Math.round(x.q.decision!.latencyMs),
      fellBack: x.q.decision!.fellBack,
      deviation: x.q.deviation?.detail,
      question: x.q.text,
      answer: x.q.answer,
      expert: d.people.find((p) => p.id === x.s.personId)?.name,
    };
  const jev = d.sessions.flatMap((s) => s.questions).filter((q) => q.decision?.engine === "jev");
  const decisions = {
    capex: toDecision(pick((x) => x.q.decision?.engine === "jev" && /0400/.test(x.q.deviation?.detail ?? ""))),
    fallback: toDecision(pick((x) => x.q.decision?.engine === "rules" && !!x.q.decision?.probabilities)),
    jevCount: jev.length,
    medianMs: Math.round(jev.map((q) => q.decision!.latencyMs).sort((a, b) => a - b)[Math.floor(jev.length / 2)] ?? 0),
  };

  // ── 3. The harness on ERPNext ──
  const cat = d.catalogs?.erpnext;
  const harness = cat && {
    tools: cat.tools.map((t) => ({ name: t.name, title: t.title, effect: t.effect })),
    alignment: (cat.alignment ?? []).map((a) => ({ canonical: a.canonical, tools: a.tools, note: a.note })),
    counts: { tools: cat.tools.length, irreversible: cat.tools.filter((t) => t.effect === "irreversible").length, write: cat.tools.filter((t) => t.effect === "write").length, read: cat.tools.filter((t) => t.effect === "read").length },
  };

  // ── 4. A page with provenance (the capex rule) and its screen moment ──
  const capex = d.pages.find((p) => /capex/i.test(p.title));
  let moment: string | undefined;
  if (capex) {
    const fid = [...capex.why, ...capex.guardrails].flatMap((x) => x.provenance).find((p) => p.frameId)?.frameId;
    const fr = fid && d.sessions.flatMap((s) => s.frames).find((f) => f.id === fid);
    if (fr && fs.existsSync(path.join("data/frames", fr.file))) {
      moment = `moment${path.extname(fr.file)}`;
      fs.copyFileSync(path.join("data/frames", fr.file), path.join(OUT, moment));
    }
  }
  const who = (id?: string) => d.people.find((p) => p.id === id)?.name ?? id;
  const page = capex && {
    title: capex.title,
    triggerText: capex.triggerText,
    steps: capex.steps.map((s) => s.text),
    why: capex.why.map((w) => ({ text: w.text, quote: w.provenance.find((p) => p.quote)?.quote, by: who(w.provenance[0]?.personId), at: w.provenance[0]?.ts })),
    guardrails: capex.guardrails.map((g) => ({ kind: g.kind, text: g.text, rule: g.rule, by: who(g.provenance[0]?.personId) })),
    mistakes: capex.mistakes.map((m) => ({ text: m.text, count: m.count })),
    moment,
  };

  // ── 5. The Schmidt story: knowledge that changes ──
  const bl = d.pages.find((p) => /blacklist/i.test(p.title) && p.conflicts?.length);
  const said = (re: RegExp) => {
    for (const s of d.sessions) for (const u of s.transcript) if (u.speaker === "expert" && re.test(u.text)) return { text: u.text, at: u.ts, by: who(s.personId) };
    return undefined;
  };
  const schmidt = bl && {
    sabine: said(/blacklisting Schmidt/i),
    thomas: said(/out of blacklist/i),
    holdDecision: toDecision(pick((x) => x.q.decision?.engine === "jev" && /4470/.test(x.q.text) && !!x.q.answer)),
    page: { title: bl.title, status: bl.status, version: bl.version },
    conflict: bl.conflicts!.map((c) => ({ kind: c.kind, status: c.status, summary: c.summary, older: c.older, newer: { by: c.newer.by, texts: c.newer.texts }, rulesOff: c.rulesOff?.length ?? 0, resolution: c.resolution }))[0],
    superseded: (bl.superseded ?? []).map((x) => ({ list: x.list, text: x.item.text })),
    rules: bl.guardrails.filter((g) => g.rule).map((g) => ({ text: g.text, rule: g.rule })),
    blacklist: (d.blacklist ?? []).map((b) => ({ supplier: b.supplierName, reason: b.reason, addedAt: b.addedAt, addedBy: b.addedBy, removedAt: b.removedAt, removedBy: b.removedBy })),
  };

  const out = { builtAt: new Date().toISOString(), frames, decisions, harness, page, schmidt };
  fs.writeFileSync(`${OUT}/data.json`, JSON.stringify(out, null, 1));
  console.log(`✔ ${OUT}/data.json · ${frames.length} frames (${frames.filter((f) => f.screen).length} read by vision) · Jev ${decisions.jevCount} decisions, median ${decisions.medianMs} ms · harness ${harness?.counts.tools ?? 0} tools · page ${page?.title ?? "—"} · Schmidt ${schmidt ? "yes" : "no"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
