import { uid } from "../store";
import type { DB, PageItem, Provenance, Session } from "../types";
import type { DraftRef, KnowledgeDraft } from "./extract";
import { regenerateLessons } from "./lessons";
import { addSessionTraces, rebuildGraph } from "./mining";

// Merge a confirmed draft into the knowledge hub: versioned pages, provenance
// on every item, graph update, lesson regeneration.

function prov(d: DB, s: Session, r: DraftRef, source: Provenance["source"]): Provenance {
  const q = r.questionId ? s.questions.find((x) => x.id === r.questionId) : undefined;
  const uttId = r.utteranceId ?? q?.answerUtteranceIds?.[0];
  const utt = uttId ? s.transcript.find((u) => u.id === uttId) : undefined;
  const ev = q?.eventId ? s.events.find((e) => e.id === q.eventId) : undefined;
  return {
    source,
    personId: s.personId,
    sessionId: s.id,
    ts: utt?.ts ?? q?.askedAt ?? ev?.ts,
    utteranceId: utt?.id,
    frameId: ev?.frameId ?? q?.frameId,
    eventId: ev?.id,
    quote: r.quote ?? utt?.text,
  };
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

export function commitDraft(d: DB, s: Session, draft: KnowledgeDraft, opts: { confirmed: boolean }) {
  const now = Date.now();
  const source: Provenance["source"] = s.mode === "interview_free" ? "stated" : opts.confirmed ? "confirmed" : "observed";
  const person = d.people.find((p) => p.id === s.personId);
  const changed: { pageId: string; title: string; created: boolean; added: string[] }[] = [];

  for (const sit of draft.situations) {
    let page = d.pages.find((p) => p.slug === sit.key);
    const created = !page;
    if (!page) {
      page = {
        id: uid("P-"), slug: sit.key, title: sit.title, situation: sit.situation, triggers: sit.triggers, triggerText: sit.triggerText,
        recognize: [], steps: [], why: [], guardrails: [], edgeCases: [], troubleshooting: [], mistakes: [], openQuestions: [],
        status: "draft", version: 0, history: [], experts: [], createdAt: now, updatedAt: now,
      };
      d.pages.push(page);
    }
    const p = page;
    const added: string[] = [];
    const item = (text: string, r: DraftRef, nodeId?: string): PageItem => ({ id: uid("I-"), text, nodeId, provenance: [prov(d, s, r, source)] });
    const pushUnique = <T extends { text: string; provenance: Provenance[] }>(list: T[], x: T, label: string) => {
      const same = list.find((y) => norm(y.text) === norm(x.text));
      if (same) {
        // corroboration: same knowledge from another session/expert
        if (!same.provenance.some((pp) => pp.sessionId === s.id)) same.provenance.push(...x.provenance);
        return;
      }
      list.push(x);
      added.push(label);
    };

    if (!created && sit.triggers.length && JSON.stringify(sit.triggers) !== JSON.stringify(p.triggers) && s.mode !== "interview_free") {
      p.triggers = sit.triggers;
      p.triggerText = sit.triggerText;
      added.push("trigger refined");
    }
    for (const r of sit.recognize ?? []) if (r) pushUnique(p.recognize, item(r, {}), "recognize");
    for (const st of sit.steps) pushUnique(p.steps, item(st.text, {}, st.tool), "step");
    for (const w of sit.why) pushUnique(p.why, item(w.text, w), "reason");
    for (const g of sit.guardrails) {
      const same = p.guardrails.find((x) => norm(x.text) === norm(g.text));
      if (same) {
        if (!same.provenance.some((pp) => pp.sessionId === s.id)) same.provenance.push(prov(d, s, g, source));
        if (g.rule && !same.rule) same.rule = g.rule;
        continue;
      }
      p.guardrails.push({ id: uid("G-"), kind: g.kind, text: g.text, contact: g.contact, rule: g.rule, provenance: [prov(d, s, g, source)] });
      added.push("guardrail");
    }
    for (const e of sit.edgeCases ?? []) {
      if (p.edgeCases.some((x) => norm(x.text) === norm(e.text))) continue;
      p.edgeCases.push({ ...item(e.text, e), learnedAt: now });
      added.push("edge case");
    }
    for (const t of sit.troubleshooting ?? []) {
      if (p.troubleshooting.some((x) => norm(x.symptom) === norm(t.symptom))) continue;
      p.troubleshooting.push({ id: uid("T-"), symptom: t.symptom, cause: t.cause, fix: t.fix, contact: t.contact, provenance: [prov(d, s, t, source)] });
      added.push("troubleshooting");
    }
    for (const oq of sit.openQuestions ?? []) if (!p.openQuestions.includes(oq)) p.openQuestions.push(oq);
    if (person && !p.experts.includes(person.id)) p.experts.push(person.id);

    if (created || added.length) {
      p.version++;
      p.updatedAt = now;
      if (opts.confirmed && s.mode !== "interview_free") p.status = "confirmed";
      p.history.push({
        version: p.version, at: now, by: person?.name ?? s.personId, sessionId: s.id,
        summary: created ? `Created from ${s.mode === "interview_free" ? "interview" : "session"} "${s.title}"` : `Learned: ${[...new Set(added)].join(", ")}`,
      });
      changed.push({ pageId: p.id, title: p.title, created, added });
    }
  }

  // permutability answers
  for (const oa of draft.orderAnswers) {
    const ids = oa.tools.map((t) => d.graph.nodes.find((n) => n.tool === t)?.id).filter(Boolean) as string[];
    if (ids.length < 2) continue;
    const key = [...ids].sort().join();
    let grp = d.graph.groups.find((g) => [...g.nodeIds].sort().join() === key);
    if (!grp) d.graph.groups.push((grp = { id: `PG-${ids.join("-")}`, nodeIds: ids, status: "unknown" }));
    grp.status = oa.permutable ? "permutable" : "ordered";
    grp.note = oa.quote;
  }

  addSessionTraces(d, s);
  rebuildGraph(d);
  const lessons = regenerateLessons(d, changed.map((c) => c.pageId));
  return { changed, lessons };
}
