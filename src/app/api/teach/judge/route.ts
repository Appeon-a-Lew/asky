import { judgePrediction, recordPrediction } from "@/lib/teach";
import { withWorkspace } from "@/lib/workspace";

async function handlePOST(req: Request) {
  const b = (await req.json()) as { sessionId: string; pageId: string; answer: string };
  const r = await judgePrediction(b.pageId, b.answer);
  recordPrediction(b.sessionId, b.pageId, r.correct);
  return Response.json(r);
}

export const POST = withWorkspace(handlePOST);
