import { db, resetDB } from "@/lib/store";

// Reset knowledge + app data for a fresh demo. Keeps the generated MCP catalogs
// and the supplier blacklist (they describe the applications and the company, not what asky learned).
export async function POST() {
  const { tools, catalogs, blacklist } = db();
  const next = resetDB();
  next.tools = tools;
  next.catalogs = catalogs;
  next.blacklist = blacklist;
  resetDB(next);
  return Response.json({ ok: true });
}
