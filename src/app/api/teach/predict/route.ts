import { predictionPrompt } from "@/lib/teach";

export async function GET(req: Request) {
  const caseId = new URL(req.url).searchParams.get("caseId") ?? "";
  return Response.json(predictionPrompt(caseId));
}
