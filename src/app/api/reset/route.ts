import { db, resetDB } from "@/lib/store";
import { withWorkspace } from "@/lib/workspace";

// Reset knowledge + app data for a fresh demo. Keeps the generated MCP catalogs
// and the supplier blacklist (they describe the applications and the company, not what asky learned).
async function handlePOST() {
  const { tools, catalogs, blacklist, workspace, usage } = db();
  const next = resetDB();
  next.tools = tools;
  next.catalogs = catalogs;
  next.blacklist = blacklist;
  // audience workspaces: a fresh demo neither extends the lifetime nor refills the budget
  next.workspace = workspace;
  next.usage = usage;
  resetDB(next);
  return Response.json({ ok: true });
}

export const POST = withWorkspace(handlePOST);
