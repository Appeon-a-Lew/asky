import "server-only";
import { connection } from "next/server";
import { db } from "./store";

/** Read the DB at request time (never prerendered). */
export async function freshDB() {
  await connection();
  return db();
}

export const personName = (d: ReturnType<typeof db>, id?: string) => d.people.find((p) => p.id === id)?.name ?? id ?? "unknown";

export function ago(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
