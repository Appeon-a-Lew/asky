import { after } from "next/server";
import { mentionsBlacklist, suggestBlacklistChanges } from "@/lib/blacklist";
import { addUtterance } from "@/lib/capture";
import type { Speaker } from "@/lib/types";
import { withWorkspace } from "@/lib/workspace";

async function handlePOST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as { speaker: Speaker; text: string; ts?: number; questionId?: string };
  const u = addUtterance(id, b);
  // "we took Schmidt off the blacklist" → a suggested list change, for a person to apply
  if (u && b.speaker === "expert" && mentionsBlacklist(u.text)) after(() => suggestBlacklistChanges(id).then(() => {}, () => {}));
  return Response.json(u);
}

export const POST = withWorkspace(handlePOST);
