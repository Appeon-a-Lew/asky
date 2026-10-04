import { answerLearner } from "@/lib/teach";
import { withWorkspace } from "@/lib/workspace";

async function handlePOST(req: Request) {
  const b = (await req.json()) as { question: string; caseId?: string };
  return Response.json({ answer: await answerLearner(b.question, b.caseId) });
}

export const POST = withWorkspace(handlePOST);
