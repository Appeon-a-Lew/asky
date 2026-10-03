import { answerLearner } from "@/lib/teach";

export async function POST(req: Request) {
  const b = (await req.json()) as { question: string; caseId?: string };
  return Response.json({ answer: await answerLearner(b.question, b.caseId) });
}
