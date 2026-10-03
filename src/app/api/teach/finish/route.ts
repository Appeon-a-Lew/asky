import { finishTeach } from "@/lib/teach";

export async function POST(req: Request) {
  const b = (await req.json()) as { sessionId: string };
  return Response.json(finishTeach(b.sessionId));
}
