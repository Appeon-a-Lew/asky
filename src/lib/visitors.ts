import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { seedDB } from "./seed";
import seedKnowledge from "./seed-knowledge.json";
import { createWorkspaceDB, DATA_ROOT, db, dropFromCache, framesDir, mutate } from "./store";
import type { DB } from "./types";
import { isVisitor, MAIN, runInWorkspace } from "./workspace";

// Audience workspaces: one private copy of asky per visitor, created from a
// clean template (demo company, Ledgerline queue, the generated tool catalogs —
// none of the presenter's sessions or pages), deleted after a few hours, with
// a budget so a public link cannot run up the API bill.
//
// So the hub is not empty on arrival, the template also holds a colleague's
// earlier work: Thomas's recorded ERPNext session, with its screen frames
// (public/seed-knowledge) and the two pages and drills it produced that the
// visitor's own tasks don't cover (intercompany approval, leave correct coding
// alone). The capex and duplicate pages stay for the visitor to teach.

const SEED = seedKnowledge as unknown as Pick<DB, "sessions" | "pages" | "lessons">;
const SEED_FRAMES = path.join(process.cwd(), "public", "seed-knowledge");
const SEED_IDS = new Set([...SEED.sessions, ...SEED.pages].map((x) => x.id));
/** Part of the starting knowledge, not something this visitor did. */
export const isSeeded = (id: string) => SEED_IDS.has(id);

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
export const TTL_MS = num(process.env.ASKY_WORKSPACE_TTL_HOURS, 6) * 3600_000;
export const MAX_WORKSPACES = num(process.env.ASKY_MAX_WORKSPACES, 60);
export const LIMITS = { llm: num(process.env.ASKY_VISITOR_LLM_CALLS, 150), ttsChars: num(process.env.ASKY_VISITOR_TTS_CHARS, 20000) };

const root = () => path.join(DATA_ROOT, "workspaces");

/** The starting point of every visitor: what a fresh demo looks like. */
export function template(now = Date.now()): DB {
  const main = runInWorkspace(MAIN, () => db());
  const k = structuredClone(SEED);
  return { ...seedDB(), sessions: k.sessions, pages: k.pages, lessons: k.lessons, tools: main.tools, catalogs: main.catalogs, blacklist: [], workspace: { visitor: true, createdAt: now, expiresAt: now + TTL_MS }, usage: { llm: 0, ttsChars: 0 } };
}

/** Delete expired workspaces; return how many are still alive. */
export function sweep(now = Date.now()): number {
  if (!fs.existsSync(root())) return 0;
  let alive = 0;
  for (const id of fs.readdirSync(root())) {
    if (!/^v-[a-z0-9]{16}$/.test(id)) continue;
    const dir = path.join(root(), id);
    let exp = 0;
    try {
      exp = (JSON.parse(fs.readFileSync(path.join(dir, "db.json"), "utf8")) as DB).workspace?.expiresAt ?? 0;
    } catch {}
    if (exp > now) alive++;
    else {
      fs.rmSync(dir, { recursive: true, force: true });
      dropFromCache(id);
    }
  }
  return alive;
}

export function createVisitorWorkspace(): { id: string; expiresAt: number } {
  if (sweep() >= MAX_WORKSPACES) throw new Error("The demo is full right now — try again in a few minutes");
  const id = `v-${Array.from(crypto.randomBytes(16), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("")}`;
  const first = template();
  createWorkspaceDB(id, first);
  if (fs.existsSync(SEED_FRAMES)) fs.cpSync(SEED_FRAMES, framesDir(id), { recursive: true });
  return { id, expiresAt: first.workspace!.expiresAt };
}

/** Count one AI call against the visitor's budget; throws when it is used up (callers fall back to heuristics). */
export function chargeLLM() {
  if (!isVisitor()) return;
  const u = db().usage ?? { llm: 0, ttsChars: 0 };
  if (u.llm >= LIMITS.llm) throw new Error("This demo workspace has used its AI budget");
  mutate((d) => {
    d.usage = { ...u, llm: u.llm + 1 };
  });
}

/** Text-to-speech budget: false when the visitor has used it up (the browser's own voice takes over). */
export function chargeTTS(chars: number): boolean {
  if (!isVisitor()) return true;
  const u = db().usage ?? { llm: 0, ttsChars: 0 };
  if (u.ttsChars + chars > LIMITS.ttsChars) return false;
  mutate((d) => {
    d.usage = { ...u, ttsChars: u.ttsChars + chars };
  });
  return true;
}
