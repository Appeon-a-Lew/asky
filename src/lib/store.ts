import "server-only";
import fs from "node:fs";
import path from "node:path";
import { seedDB } from "./seed";
import type { DB } from "./types";
import { currentWorkspace, MAIN } from "./workspace";

// Tiny JSON-file store, one file per workspace. One process (Next server) owns
// writes; the MCP server and harness talk to it over HTTP. "main" lives in the
// data dir itself (as before); audience workspaces in data/workspaces/<id>/.

export const DATA_ROOT = process.env.ASKY_DATA_DIR || path.join(process.cwd(), "data");

/** The current workspace's data directory (db.json, frames/, audio/). */
export function dataDir(ws = currentWorkspace()) {
  return ws === MAIN ? DATA_ROOT : path.join(DATA_ROOT, "workspaces", ws);
}
export const framesDir = (ws = currentWorkspace()) => path.join(dataDir(ws), "frames");

const g = globalThis as unknown as { __askyDBs?: Map<string, { db: DB; mtime: number }> };
const cache = (g.__askyDBs ??= new Map());

export function db(): DB {
  const ws = currentWorkspace();
  const file = path.join(dataDir(ws), "db.json");
  const mtime = fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0;
  const hit = cache.get(ws);
  // Reload when the file was changed outside this process (e.g. seed script).
  if (hit && (!mtime || mtime === hit.mtime)) return hit.db;
  if (mtime) {
    cache.set(ws, { db: JSON.parse(fs.readFileSync(file, "utf8")) as DB, mtime });
  } else {
    // an audience workspace is created explicitly (lib/visitors); once its folder is gone it has expired
    if (ws !== MAIN) throw new Error("This demo workspace has expired — start a new one on the home page");
    cache.set(ws, { db: seedDB(), mtime: 0 });
    persist(ws);
  }
  return cache.get(ws)!.db;
}

function persist(ws = currentWorkspace()) {
  const dir = dataDir(ws);
  fs.mkdirSync(path.join(dir, "frames"), { recursive: true });
  const file = path.join(dir, "db.json");
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache.get(ws)!.db, null, 1));
  fs.renameSync(tmp, file);
  cache.get(ws)!.mtime = fs.statSync(file).mtimeMs;
}

/** Apply a mutation and write through. Returns whatever the mutator returns. */
export function mutate<T>(fn: (d: DB) => T): T {
  const d = db();
  const out = fn(d);
  persist();
  return out;
}

export function resetDB(next?: DB) {
  const ws = currentWorkspace();
  cache.set(ws, { db: next ?? seedDB(), mtime: 0 });
  persist(ws);
  return cache.get(ws)!.db;
}

/** Write a workspace's first db (audience workspaces). */
export function createWorkspaceDB(ws: string, first: DB) {
  cache.set(ws, { db: first, mtime: 0 });
  persist(ws);
}

/** Forget a deleted workspace. */
export const dropFromCache = (ws: string) => cache.delete(ws);

export function uid(prefix = "") {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
