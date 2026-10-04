import { finishTeach } from "@/lib/teach";
import { withWorkspace } from "@/lib/workspace";

async function handlePOST(req: Request) {
  const b = (await req.json()) as { sessionId: string };
  return Response.json(finishTeach(b.sessionId));
}

export const POST = withWorkspace(handlePOST);
