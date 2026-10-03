import { notFound } from "next/navigation";
import { freshDB } from "@/lib/fresh";
import LessonPlayer from "./LessonPlayer";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await freshDB();
  const l = d.lessons.find((x) => x.id === id);
  if (!l) notFound();
  const frames = Object.fromEntries(d.sessions.flatMap((s) => s.frames.map((f) => [f.id, `/api/frames/${f.file}`])));
  return <LessonPlayer lesson={l} frames={frames} />;
}
