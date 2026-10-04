import { predictionPrompt } from "@/lib/teach";
import { withWorkspace } from "@/lib/workspace";

async function handleGET(req: Request) {
  const caseId = new URL(req.url).searchParams.get("caseId") ?? "";
  return Response.json(predictionPrompt(caseId));
}

export const GET = withWorkspace(handleGET);
