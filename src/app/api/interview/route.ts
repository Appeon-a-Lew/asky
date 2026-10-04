import { startInterview } from "@/lib/knowledge/interview";
import { withWorkspace } from "@/lib/workspace";

async function handlePOST(req: Request) {
  const b = (await req.json()) as { mode: "interview_free" | "interview_guided"; personId: string };
  return Response.json(await startInterview(b.mode, b.personId));
}

export const POST = withWorkspace(handlePOST);
