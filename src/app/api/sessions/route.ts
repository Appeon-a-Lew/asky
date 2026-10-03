import { createSession } from "@/lib/capture";
import { db } from "@/lib/store";
import type { SessionMode } from "@/lib/types";

export async function GET() {
  return Response.json(
    db().sessions.map((s) => ({
      id: s.id, mode: s.mode, title: s.title, personId: s.personId, startedAt: s.startedAt, endedAt: s.endedAt, phase: s.phase,
      events: s.events.length, questions: s.questions.length, answered: s.questions.filter((q) => q.status === "answered").length,
    })),
  );
}

export async function POST(req: Request) {
  const b = (await req.json()) as { mode: SessionMode; personId: string; title?: string; trainingCaseIds?: string[] };
  return Response.json(createSession(b.mode, b.personId, b.title, b.trainingCaseIds));
}
