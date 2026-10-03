import { expectedNext } from "../engine/graph";
import { uid } from "../store";
import type { DB, Lesson, LessonItem, Page } from "../types";

// Lessons are generated from pages + graph and regenerated whenever a page
// version changes. A page update also produces a short "what changed" lesson.

const quoteOf = (p: Page) => p.why.flatMap((w) => w.provenance).find((x) => x.quote);

function drillFor(d: DB, p: Page): LessonItem[] {
  const items: LessonItem[] = [];
  const q = quoteOf(p);
  const correct = p.steps[0]?.text ?? p.guardrails[0]?.text;
  if (correct) {
    const distractors = d.pages.filter((x) => x.id !== p.id).flatMap((x) => x.steps.map((s) => s.text)).slice(0, 2);
    const generic = ["Post it — the OCR coding is usually right", "Ask the supplier to re-send the invoice"];
    const options = [correct, ...distractors, ...generic].slice(0, 3).sort(() => Math.random() - 0.5);
    items.push({
      id: uid("L-"), kind: "predict", pageId: p.id,
      prompt: `${p.triggerText}. What would ${expertName(d, p)} do?`,
      options, answer: correct,
      explanation: p.why[0]?.text ?? p.situation,
      quote: q?.quote, frameId: q?.frameId,
    });
  }
  for (const g of p.guardrails) {
    items.push({
      id: uid("L-"), kind: "quiz", pageId: p.id,
      prompt: `True or false: ${g.text}`,
      options: ["True", "False"], answer: "True",
      explanation: g.provenance.find((x) => x.quote)?.quote ?? g.text,
      quote: g.provenance.find((x) => x.quote)?.quote, frameId: g.provenance.find((x) => x.frameId)?.frameId,
    });
  }
  return items;
}

const expertName = (d: DB, p: Page) => d.people.find((x) => x.id === p.experts[0])?.name.split(" ")[0] ?? "the expert";

function walkthrough(d: DB): Lesson {
  const g = d.graph;
  const items: LessonItem[] = [];
  let tool: string | null = null;
  const seen = new Set<string>();
  for (let k = 0; k < 10; k++) {
    const ranked: [string, { prob: number }][] = [...expectedNext(g, tool).entries()].sort((a, b) => b[1].prob - a[1].prob);
    const next = ranked[0];
    if (!next || seen.has(next[0])) break;
    seen.add(next[0]);
    tool = next[0];
    const node = g.nodes.find((n) => n.tool === tool);
    const pages = d.pages.filter((p) => node?.pageIds.includes(p.id));
    const tdef = d.tools?.tools.find((t) => t.name === tool);
    items.push({
      id: uid("L-"), kind: "explain", nodeId: node?.id,
      prompt: `${k + 1}. ${node?.label ?? tool}`,
      explanation: [tdef?.description, ...pages.map((p) => `⚑ ${p.title}`)].filter(Boolean).join("\n"),
      quote: pages.map(quoteOf).find(Boolean)?.quote,
    });
  }
  return { id: "LES-walkthrough", title: "The invoice process, step by step", kind: "walkthrough", pageIds: d.pages.map((p) => p.id), items, basedOn: d.pages.map((p) => ({ pageId: p.id, version: p.version })), createdAt: Date.now() };
}

export function regenerateLessons(d: DB, changedPageIds: string[]) {
  const now = Date.now();
  const made: string[] = [];
  d.lessons = d.lessons.filter((l) => l.id !== "LES-walkthrough");
  d.lessons.unshift(walkthrough(d));
  for (const p of d.pages) {
    const id = `LES-drill-${p.slug}`;
    const prev = d.lessons.find((l) => l.id === id);
    const prevVersion = prev?.basedOn[0]?.version;
    if (prev && prevVersion === p.version) continue;
    d.lessons = d.lessons.filter((l) => l.id !== id);
    d.lessons.push({ id, title: p.title, kind: "drill", pageIds: [p.id], items: drillFor(d, p), basedOn: [{ pageId: p.id, version: p.version }], createdAt: now });
    made.push(id);
    if (prev && changedPageIds.includes(p.id)) {
      const last = p.history.at(-1);
      d.lessons.push({
        id: uid("LES-delta-"), title: `What changed: ${p.title} (v${p.version})`, kind: "delta", pageIds: [p.id],
        items: [{ id: uid("L-"), kind: "explain", pageId: p.id, prompt: last?.summary ?? "Updated", explanation: [...p.edgeCases.slice(-2).map((e) => e.text), ...p.guardrails.slice(-1).map((g) => g.text)].join("\n") }],
        basedOn: [{ pageId: p.id, version: p.version }], createdAt: now,
      });
    }
  }
  return made;
}
