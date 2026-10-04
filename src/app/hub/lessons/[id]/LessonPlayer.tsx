"use client";

import Link from "next/link";
import { useState } from "react";
import { speak } from "@/components/hub";
import type { Lesson } from "@/lib/types";

export default function LessonPlayer({ lesson, frames }: { lesson: Lesson; frames: Record<string, string> }) {
  const [k, setK] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const item = lesson.items[k];
  const done = k >= lesson.items.length;
  const next = () => { setPicked(null); setK((x) => x + 1); };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="text-xs text-stone-500"><Link href="/hub/lessons" className="hover:underline">Lessons</Link> / {lesson.kind}</div>
      <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-stone-900">{lesson.title}</h1>
      <div className="h-1.5 overflow-hidden rounded bg-stone-200"><div className="h-full bg-amber-400 transition-all" style={{ width: `${(Math.min(k, lesson.items.length) / Math.max(1, lesson.items.length)) * 100}%` }} /></div>
      {done ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <div className="text-lg font-semibold">Done</div>
          {lesson.items.some((i) => i.options) && <div className="text-sm text-emerald-800">{score} / {lesson.items.filter((i) => i.options).length} correct</div>}
          <Link href="/teach" className="mt-3 inline-block rounded-md bg-stone-900 px-4 py-2 text-sm text-white">Practice on a real case →</Link>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="text-lg font-medium">{item.prompt}</div>
          {item.options ? (
            <div className="space-y-2">
              {item.options.map((o) => {
                const isRight = o === item.answer;
                const cls = picked ? (isRight ? "border-emerald-500 bg-emerald-50" : picked === o ? "border-rose-400 bg-rose-50" : "border-stone-200") : "border-stone-200 hover:border-stone-400";
                return <button key={o} disabled={!!picked} onClick={() => { setPicked(o); if (isRight) setScore((s) => s + 1); }} className={`block w-full rounded-lg border p-3 text-left text-sm ${cls}`}>{o}</button>;
              })}
            </div>
          ) : null}
          {(picked || !item.options) && (
            <div className="space-y-2 rounded-lg bg-stone-50 p-3 text-sm">
              <p className="whitespace-pre-line">{item.explanation}</p>
              {item.quote && <blockquote className="border-l-2 border-amber-400 pl-3 italic">“{item.quote}” <button onClick={() => speak(item.quote!)} className="ml-1 text-xs not-italic text-sky-700 underline">▶ listen</button></blockquote>}
              {item.frameId && frames[item.frameId] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frames[item.frameId]} alt="expert's screen" className="rounded border border-stone-200" />
              )}
            </div>
          )}
          {(picked || !item.options) && <button onClick={next} className="rounded-md bg-stone-900 px-4 py-2 text-sm text-white">Next</button>}
        </div>
      )}
    </div>
  );
}
