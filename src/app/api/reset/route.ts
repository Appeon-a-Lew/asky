import { db, resetDB } from "@/lib/store";

// Reset knowledge + app data for a fresh demo. Keeps the generated MCP catalog.
export async function POST() {
  const tools = db().tools;
  const next = resetDB();
  next.tools = tools;
  resetDB(next);
  return Response.json({ ok: true });
}
