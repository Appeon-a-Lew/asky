import { judgePrediction, recordPrediction } from "@/lib/teach";

export async function POST(req: Request) {
  const b = (await req.json()) as { sessionId: string; pageId: string; answer: string };
  const r = await judgePrediction(b.pageId, b.answer);
  recordPrediction(b.sessionId, b.pageId, r.correct);
  return Response.json(r);
}
