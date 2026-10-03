import { startInterview } from "@/lib/knowledge/interview";

export async function POST(req: Request) {
  const b = (await req.json()) as { mode: "interview_free" | "interview_guided"; personId: string };
  return Response.json(await startInterview(b.mode, b.personId));
}
