import "server-only";
import fs from "node:fs";
import path from "node:path";
import { seedDB } from "./seed";
import type { DB } from "./types";

// Tiny JSON-file store. One process (Next server) owns writes; the MCP server
// and harness talk to it over HTTP. Good enough for a hackathon, trivially
// swappable for Postgres later.

export const DATA_DIR = process.env.ASKY_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
export const FRAMES_DIR = path.join(DATA_DIR, "frames");

const g = globalThis as unknown as { __askyDB?: DB; __askyMtime?: number };

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
}

export function db(): DB {
  ensureDirs();
  const mtime = fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).mtimeMs : 0;
  // Reload when the file was changed outside this process (e.g. seed script).
  if (!g.__askyDB || (mtime && mtime !== g.__askyMtime)) {
    if (mtime) {
      g.__askyDB = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as DB;
      g.__askyMtime = mtime;
    } else {
      g.__askyDB = seedDB();
      persist();
    }
  }
  return g.__askyDB!;
}

function persist() {
  ensureDirs();
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(g.__askyDB, null, 1));
  fs.renameSync(tmp, DB_FILE);
  g.__askyMtime = fs.statSync(DB_FILE).mtimeMs;
}

/** Apply a mutation and write through. Returns whatever the mutator returns. */
export function mutate<T>(fn: (d: DB) => T): T {
  const d = db();
  const out = fn(d);
  persist();
  return out;
}

export function resetDB(next?: DB) {
  g.__askyDB = next ?? seedDB();
  persist();
  return g.__askyDB;
}

export function uid(prefix = "") {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
