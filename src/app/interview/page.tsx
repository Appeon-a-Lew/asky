"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Orb from "@/components/Orb";
import { PageHeader } from "@/components/hub";
import { Icon } from "@/components/icons";
import Shell from "@/components/Shell";
import { useInterrupts } from "@/components/useInterrupts";
import { useVoice, VoiceProvider } from "@/components/voice/VoiceProvider";
import { j } from "@/lib/client";
import type { Question } from "@/lib/types";

type Mode = "interview_free" | "interview_guided" | "recording";
type Imported = { sessionId: string; title: string; language?: string; durationSec: number; stt: string; speakers: number; transcript: { speaker: string; text: string; start?: number }[]; changed: { pageId: string; title: string; created: boolean; added: string[] }[] };

const formOf = (file: File, personId: string) => {
  const f = new FormData();
  f.set("file", file);
  f.set("personId", personId);
  return f;
};

const mmss = (sec = 0) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

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
  const [imported, setImported] = useState<Imported | null>(null);
  const [importError, setImportError] = useState("");
  const [person, setPerson] = useState("sabine");
  const [sid, setSid] = useState<string | null>(null);
  const [questions, setQuestions] = useState<(Question & { why?: string })[]>([]);
  const [lines, setLines] = useState<{ who: string; text: string }[]>([]);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState<{ changed: { pageId: string; title: string; created: boolean; added: string[] }[] } | null>(null);
  const it = useInterrupts({ sessionId: sid, voice, speaker: "expert", pauseMs: 99999, budgetPer10Min: 99, enabled: false, onAsk: (q) => setLines((l) => [...l, { who: "asky", text: q.text }]) });

  useEffect(() => voice.onUtterance((u) => setLines((l) => [...l, { who: "expert", text: u.text }])), [voice]);

  async function importRecording(file?: File) {
    setMode("recording");
    setImported(null);
    setImportError("");
    setBusy("Transcribing with ElevenLabs Scribe, then extracting the knowledge… (about a minute)");
    try {
      const r = file
        ? await fetch("/api/interview/import", { method: "POST", body: formOf(file, person) })
        : await fetch("/api/interview/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sample: true, personId: person }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setImported(j);
    } catch (e) {
      setImportError((e as Error).message);
    }
    setBusy("");
  }

  async function start(m: Exclude<Mode, "recording">) {
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
      <div className="mx-auto max-w-5xl space-y-5 px-8 py-8">
        <PageHeader eyebrow="Step 0" title="Interview" subtitle={<>Three ways to capture what is in an expert&apos;s head besides watching them work.</>} />

        {!mode && (
          <div className="grid grid-cols-3 gap-4">
            <label className="col-span-3 flex items-center gap-2 text-sm">Expert
              <select value={person} onChange={(e) => setPerson(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5">
                <option value="sabine">Sabine Weber</option><option value="thomas">Thomas Brandt</option>
              </select>
            </label>
            <button onClick={() => start("interview_free")} className="group flex flex-col items-start rounded-2xl border border-stone-200/80 bg-white p-6 text-left shadow-[0_1px_2px_rgba(28,27,24,0.04)] transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md">
              <span className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700 ring-1 ring-violet-100"><Icon name="mic" className="h-5 w-5" /></span>
              <div className="text-lg font-semibold tracking-tight">Free-form</div>
              <p className="mt-1 text-sm text-stone-600">The expert explains their loops in their own words, without guidance. asky only listens. Everything becomes <i>stated</i> knowledge — a draft that capture sessions confirm or correct.</p>
            </button>
            <button onClick={() => start("interview_guided")} className="group flex flex-col items-start rounded-2xl border border-stone-200/80 bg-white p-6 text-left shadow-[0_1px_2px_rgba(28,27,24,0.04)] transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md">
              <span className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100"><Icon name="graph" className="h-5 w-5" /></span>
              <div className="text-lg font-semibold tracking-tight">AI-guided</div>
              <p className="mt-1 text-sm text-stone-600">asky knows the process graph and the pages, and asks exactly about what is unsure: open questions, rare branches, single-expert knowledge, step order, and what was said but never observed.</p>
            </button>
            <div className="group flex flex-col items-start rounded-2xl border border-stone-200/80 bg-white p-6 text-left shadow-[0_1px_2px_rgba(28,27,24,0.04)]">
              <span className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100"><Icon name="lessons" className="h-5 w-5" /></span>
              <div className="text-lg font-semibold tracking-tight">Recorded interview</div>
              <p className="mt-1 text-sm text-stone-600">An interview or meeting recorded earlier, in any language. ElevenLabs Scribe transcribes it and separates the speakers; asky extracts the rules and keeps every quote&apos;s place in the recording.</p>
              <div className="mt-4 w-full space-y-2">
                <audio controls preload="none" src="/demo/interview-sabine-de.mp3" className="h-9 w-full" />
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => importRecording()} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-stone-800">Import sample (Sabine, German, 3:25)</button>
                  <label className="cursor-pointer rounded-lg border border-stone-300 px-3 py-1.5 text-sm transition hover:border-stone-400">
                    Upload…
                    <input type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => e.target.files?.[0] && importRecording(e.target.files[0])} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === "recording" && <RecordingResult busy={busy} error={importError} r={imported} onBack={() => setMode(null)} />}

        {mode && mode !== "recording" && (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-3">
              <div className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(28,27,24,0.04)]">
                <Orb speaking={voice.agentSpeaking} listening={voice.userSpeaking} />
                <div className="flex-1 text-sm">
                  <div className="font-medium">{mode === "interview_free" ? "Listening — tell me about your work" : it.state.active ? "Listening for your answer" : "Guided interview"}</div>
                  <div className="text-xs text-stone-500">{busy || `${voice.engine} voice`}</div>
                </div>
                {mode === "interview_guided" && !done && questions.some((q) => q.status === "pending") && !it.state.active && <button onClick={runGuided} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-stone-800">Start questions</button>}
                {!done && <button onClick={finish} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm">Finish & extract</button>}
              </div>
              {mode === "interview_free" && !lines.length && (
                <div className="rounded-2xl border border-dashed border-stone-300 p-4 text-sm text-stone-500">
                  Try: “Every morning I open the AP inbox. Freight from Schmidt is always fine. Equipment over five thousand is capex — never book that without an asset number. Anything from our Czech subsidiary goes to Dr. Fischer…”
                </div>
              )}
              <div className="min-h-[280px] space-y-2 rounded-2xl border border-stone-200/80 bg-white p-4 text-sm shadow-[0_1px_2px_rgba(28,27,24,0.04)]">
                {lines.map((l, k) => <div key={k}><span className={`mr-1 text-xs font-semibold ${l.who === "asky" ? "text-amber-700" : "text-stone-700"}`}>{l.who}</span>{l.text}</div>)}
              </div>
              {!done && (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { voice.typeAnswer(typed.trim()); setTyped(""); } }}>
                  <textarea value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Speak, or type / paste here" className="h-20 flex-1 rounded-xl border border-stone-300 bg-white p-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
                  <button className="rounded-xl bg-stone-900 px-5 text-sm font-medium text-white transition hover:bg-stone-800">Send</button>
                </form>
              )}
              {done && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
                  <div className="mb-2 font-semibold">Added to the knowledge hub</div>
                  <ul>{done.changed.map((c) => <li key={c.pageId}><Link href={`/hub/pages/${c.pageId}`} className="underline">{c.title}</Link> <span className="text-xs text-emerald-700">{c.created ? "new draft" : c.added.join(", ")}</span></li>)}</ul>
                  {!done.changed.length && <div className="text-stone-600">Nothing rule-like was found — try mentioning limits, exceptions, or “always/never”.</div>}
                </div>
              )}
            </div>
            <div className="space-y-2">
              {mode === "interview_guided" && (
                <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(28,27,24,0.04)]">
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
              {mode === "interview_free" && <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-xs text-violet-900">Free-form knowledge is tagged <b>stated</b>. When asky later sees the expert do something different on screen, that contradiction becomes the most valuable question of the next session.</div>}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function RecordingResult({ busy, error, r, onBack }: { busy: string; error: string; r: Imported | null; onBack: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const seek = (t?: number) => {
    if (!audio.current || t === undefined) return;
    audio.current.currentTime = t;
    audio.current.play().catch(() => {});
  };
  if (busy || error || !r) {
    return (
      <div className={`rounded-2xl border p-6 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-900" : "border-stone-200/80 bg-white text-stone-600"}`}>
        {error ? <>Import failed: {error}</> : <span className="flex items-center gap-3"><Orb speaking={false} listening /> {busy}</span>}
        {error && <button onClick={onBack} className="ml-3 underline">back</button>}
      </div>
    );
  }
  const created = r.changed.filter((c) => c.created);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(28,27,24,0.04)]">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
            <span className="font-medium text-stone-800">{r.title}</span>
            <span className="rounded bg-stone-100 px-1.5 py-0.5">{mmss(r.durationSec)} min</span>
            <span className="rounded bg-stone-100 px-1.5 py-0.5">{r.speakers} speakers</span>
            <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono">{r.stt}</span>
          </div>
          <audio ref={audio} controls src={`/api/audio/${r.sessionId}`} className="h-9 w-full" />
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded-2xl border border-stone-200/80 bg-white p-4 text-sm shadow-[0_1px_2px_rgba(28,27,24,0.04)]">
          {r.transcript.map((u, k) => (
            <button key={k} onClick={() => seek(u.start)} className="flex w-full gap-3 rounded-lg px-2 py-1 text-left hover:bg-stone-50">
              <span className="w-10 shrink-0 pt-0.5 font-mono text-[11px] text-stone-400">{mmss(u.start)}</span>
              <span><span className={`mr-1 text-xs font-semibold ${u.speaker === "agent" ? "text-sky-700" : "text-stone-800"}`}>{u.speaker === "agent" ? "interviewer" : "expert"}</span>{u.text}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <div className="mb-2 font-semibold text-emerald-900">Added to the knowledge hub</div>
          <div className="mb-2 text-xs text-emerald-800">{created.length} new pages · {r.changed.length - created.length} updated</div>
          <ul className="space-y-1.5">{r.changed.map((c) => <li key={c.pageId}><Link href={`/hub/pages/${c.pageId}`} className="underline">{c.title}</Link> <span className="text-xs text-emerald-700">{c.created ? "new draft" : `+ ${[...new Set(c.added)].join(", ")}`}</span></li>)}</ul>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-xs text-violet-900">Spoken knowledge is tagged <b>stated</b> until a capture session shows it on screen. Pages are written in English; quotes stay in the expert&apos;s own words with a translation, and each one replays from the recording.</div>
        <button onClick={onBack} className="text-sm text-stone-500 underline">another interview</button>
      </div>
    </div>
  );
}
