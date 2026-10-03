"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Orb from "@/components/Orb";
import Shell from "@/components/Shell";
import { useInterrupts } from "@/components/useInterrupts";
import { useVoice, VoiceProvider } from "@/components/voice/VoiceProvider";
import { j } from "@/lib/client";
import type { Question } from "@/lib/types";

type Mode = "interview_free" | "interview_guided";

export default function InterviewPage() {
  return (
    <VoiceProvider>
      <Interview />
    </VoiceProvider>
  );
}

function Interview() {
  const voice = useVoice();
  const [mode, setMode] = useState<Mode | null>(null);
  const [person, setPerson] = useState("sabine");
  const [sid, setSid] = useState<string | null>(null);
  const [questions, setQuestions] = useState<(Question & { why?: string })[]>([]);
  const [lines, setLines] = useState<{ who: string; text: string }[]>([]);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState<{ changed: { pageId: string; title: string; created: boolean; added: string[] }[] } | null>(null);
  const it = useInterrupts({ sessionId: sid, voice, speaker: "expert", pauseMs: 99999, budgetPer10Min: 99, enabled: false, onAsk: (q) => setLines((l) => [...l, { who: "asky", text: q.text }]) });

  useEffect(() => voice.onUtterance((u) => setLines((l) => [...l, { who: "expert", text: u.text }])), [voice]);

  async function start(m: Mode) {
    setMode(m);
    setBusy(m === "interview_guided" ? "Finding what the hub is unsure about…" : "");
    const r = await j<{ session: { id: string; questions: Question[] }; reasons: string[] }>("POST", "/api/interview", { mode: m, personId: person });
    setSid(r.session.id);
    setQuestions(r.session.questions.map((q, k) => ({ ...q, why: r.reasons[k] })));
    setBusy("");
    await voice.start(m === "interview_free" ? "interview" : "debrief").catch(() => {});
  }

  async function runGuided() {
    for (const q of questions) {
      const a = await it.askNow(q);
      setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, status: "answered", answer: a } : x)));
    }
  }

  async function finish() {
    if (!sid) return;
    setBusy("Turning the interview into pages…");
    const r = await j<{ changed: { pageId: string; title: string; created: boolean; added: string[] }[] }>("POST", `/api/interview/${sid}/finish`);
    setDone(r);
    setBusy("");
    voice.stop();
  }

  return (
    <Shell>
      <div className="mx-auto max-w-5xl space-y-5 px-5 py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Interview</h1>
          <p className="text-sm text-stone-500">Two ways to capture what is in an expert&apos;s head besides watching them work.</p>
        </div>

        {!mode && (
          <div className="grid grid-cols-2 gap-4">
            <label className="col-span-2 flex items-center gap-2 text-sm">Expert
              <select value={person} onChange={(e) => setPerson(e.target.value)} className="rounded-md border border-stone-300 px-2 py-1">
                <option value="sabine">Sabine Weber</option><option value="thomas">Thomas Brandt</option>
              </select>
            </label>
            <button onClick={() => start("interview_free")} className="rounded-xl border border-stone-200 bg-white p-5 text-left shadow-sm hover:border-stone-400">
              <div className="text-lg font-semibold">1 · Free-form</div>
              <p className="mt-1 text-sm text-stone-600">The expert explains their loops in their own words, without guidance. asky only listens. Everything becomes <i>stated</i> knowledge — a draft that capture sessions confirm or correct.</p>
            </button>
            <button onClick={() => start("interview_guided")} className="rounded-xl border border-stone-200 bg-white p-5 text-left shadow-sm hover:border-stone-400">
              <div className="text-lg font-semibold">2 · AI-guided</div>
              <p className="mt-1 text-sm text-stone-600">asky knows the process graph and the pages, and asks exactly about what is unsure: open questions, rare branches, single-expert knowledge, step order, and what was said but never observed.</p>
            </button>
          </div>
        )}

        {mode && (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-3">
              <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <Orb speaking={voice.agentSpeaking} listening={voice.userSpeaking} />
                <div className="flex-1 text-sm">
                  <div className="font-medium">{mode === "interview_free" ? "Listening — tell me about your work" : it.state.active ? "Listening for your answer" : "Guided interview"}</div>
                  <div className="text-xs text-stone-500">{busy || `${voice.engine} voice`}</div>
                </div>
                {mode === "interview_guided" && !done && questions.some((q) => q.status === "pending") && !it.state.active && <button onClick={runGuided} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm text-white">Start questions</button>}
                {!done && <button onClick={finish} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm">Finish & extract</button>}
              </div>
              {mode === "interview_free" && !lines.length && (
                <div className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-500">
                  Try: “Every morning I open the AP inbox. Freight from Schmidt is always fine. Equipment over five thousand is capex — never book that without an asset number. Anything from our Czech subsidiary goes to Dr. Fischer…”
                </div>
              )}
              <div className="min-h-[280px] space-y-2 rounded-xl border border-stone-200 bg-white p-4 text-sm shadow-sm">
                {lines.map((l, k) => <div key={k}><span className={`mr-1 text-xs font-semibold ${l.who === "asky" ? "text-amber-700" : "text-stone-700"}`}>{l.who}</span>{l.text}</div>)}
              </div>
              {!done && (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { voice.typeAnswer(typed.trim()); setTyped(""); } }}>
                  <textarea value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Speak, or type / paste here" className="h-20 flex-1 rounded-md border border-stone-300 p-2 text-sm" />
                  <button className="rounded-md bg-stone-900 px-4 text-sm text-white">Send</button>
                </form>
              )}
              {done && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
                  <div className="mb-2 font-semibold">Added to the knowledge hub</div>
                  <ul>{done.changed.map((c) => <li key={c.pageId}><Link href={`/hub/pages/${c.pageId}`} className="underline">{c.title}</Link> <span className="text-xs text-emerald-700">{c.created ? "new draft" : c.added.join(", ")}</span></li>)}</ul>
                  {!done.changed.length && <div className="text-stone-600">Nothing rule-like was found — try mentioning limits, exceptions, or “always/never”.</div>}
                </div>
              )}
            </div>
            <div className="space-y-2">
              {mode === "interview_guided" && (
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Planned questions</div>
                  <ol className="space-y-2 text-sm">
                    {questions.map((q) => (
                      <li key={q.id} className={q.status === "answered" ? "text-stone-400" : ""}>
                        {q.text}
                        <div className="text-[11px] text-stone-400">because: {q.why}</div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {mode === "interview_free" && <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs text-violet-900">Free-form knowledge is tagged <b>stated</b>. When asky later sees the expert do something different on screen, that contradiction becomes the most valuable question of the next session.</div>}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
