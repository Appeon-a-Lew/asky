import { addToBlacklist, decideSuggestion, removeFromBlacklist } from "@/lib/blacklist";
import { db } from "@/lib/store";
import { withWorkspace } from "@/lib/workspace";

// GET → the list (current and past); GET ?suggestions → what asky heard.
// POST {action: "add"|"remove", supplierName, reason, by, source?, at?, sessionId?} · {action: "apply"|"dismiss", suggestionId, by?}.
async function handleGET(req: Request) {
  if (new URL(req.url).searchParams.has("suggestions")) return Response.json(db().blacklistSuggestions ?? []);
  return Response.json(db().blacklist ?? []);
}

async function handlePOST(req: Request) {
  const b = (await req.json()) as { action: "add" | "remove" | "apply" | "dismiss"; suggestionId?: string; supplierName?: string; reason?: string; by?: string; source?: string; at?: number; sessionId?: string };
  // a suggestion asky heard in a session: a person applies or dismisses it
  if (b.action === "apply" || b.action === "dismiss") {
    const r = b.suggestionId ? decideSuggestion(b.suggestionId, b.action, b.by?.trim() || "Reviewer") : null;
    return r ? Response.json(r) : Response.json({ error: "suggestion not found or already decided" }, { status: 404 });
  }
  if (!b.supplierName?.trim() || !b.reason?.trim()) return Response.json({ error: "supplierName and reason required" }, { status: 400 });
  const by = b.by?.trim() || "Hub";
  if (b.action === "add") return Response.json(addToBlacklist({ supplierName: b.supplierName, reason: b.reason, by, source: b.source, at: b.at, sessionId: b.sessionId }));
  const r = removeFromBlacklist({ supplierName: b.supplierName, reason: b.reason, by, at: b.at, sessionId: b.sessionId });
  return r ? Response.json(r) : Response.json({ error: `${b.supplierName} is not on the blacklist` }, { status: 404 });
}

export const GET = withWorkspace(handleGET);
export const POST = withWorkspace(handlePOST);
