"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AppFrame, { type AppFrameHandle, type BridgeMsg, type GateMsg } from "@/components/AppFrame";
import Orb from "@/components/Orb";
import Shell from "@/components/Shell";
import { useInterrupts } from "@/components/useInterrupts";
import { useScreenShare } from "@/components/useScreenShare";
import { useVoice, VoiceProvider } from "@/components/voice/VoiceProvider";
import { api, j, type Recognized } from "@/lib/client";
import type { Question } from "@/lib/types";

type Phase = "setup" | "live" | "debrief" | "teachback" | "done";
type FeedItem = { id: string; ts: number; text: string; kind: string; tag?: string };

const EXPERTS = [
  { id: "sabine", name: "Sabine Weber" },
  { id: "thomas", name: "Thomas Brandt" },
];

/** The teach-back is spoken like a question: the expert's reply confirms or corrects it. */
function teachBackQuestion(sessionId: string, text: string): Question {
  const now = Date.now();
  return { id: `tb-${now}`, sessionId, ts: now, kind: "teachback", timing: "debrief", text, importance: 1, status: "pending", dedupeKey: `tb-${now}` };
}

export default function CapturePage() {
  return (
    <VoiceProvider>
      <Capture />
    </VoiceProvider>
  );
}

function Capture() {
  const voice = useVoice();
  const [phase, setPhase] = useState<Phase>("setup");
  const [person, setPerson] = useState("sabine");
  const [sid, setSid] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [decisions, setDecisions] = useState<Question[]>([]);
  const [recognized, setRecognized] = useState<(Recognized & { ts: number })[]>([]);
  const [known, setKnown] = useState<{ pages: number; titles: string[] } | null>(null);
  const [fresh, setFresh] = useState(true);
  const [transcript, setTranscript] = useState<{ who: string; text: string; ts: number }[]>([]);
  const [blur, setBlur] = useState(true);
  const [typed, setTyped] = useState("");
  const [teachBack, setTeachBack] = useState<string | null>(null);
  const [result, setResult] = useState<{ pageId: string; title: string; created: boolean; added: string[] }[] | null>(null);
  const [status, setStatus] = useState("");
  const frame = useRef<AppFrameHandle>(null);
  const lastAppEvent = useRef(0);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const it = useInterrupts({
    sessionId: sid, voice, speaker: "expert", pauseMs: 1800, budgetPer10Min: 5, enabled: phase === "live",
    onOffRecord: (on) => setStatus(on ? "Off the record — nothing is captured" : "Back on the record"),
    onAsk: (q) => setTranscript((t) => [...t, { who: "asky", text: q.text, ts: q.ts }]),
  });

  useEffect(() => voice.onUtterance((u) => setTranscript((t) => [...t, { who: "expert", text: u.text, ts: u.ts }])), [voice]);

  const share = useScreenShare({
    sessionId: sid,
    lastAppEventAt: () => lastAppEvent.current,
    onResult: (r) => {
      const qs = (r.questions ?? []) as Question[];
      if (qs.length) {
        it.enqueue(qs);
        setDecisions((d) => [...qs, ...d]);
      }
      for (const e of (r.events ?? []) as { id: string; ts: number; summary: string; kind: string }[]) setFeed((f) => [{ id: e.id, ts: e.ts, text: e.summary, kind: e.kind, tag: "vision" }, ...f]);
    },
  });

  useEffect(() => {
    j<{ pages: { title: string }[] }>("GET", "/api/knowledge").then((k) => setKnown({ pages: k.pages.length, titles: k.pages.map((p) => p.title) })).catch(() => {});
  }, []);

  async function start() {
    // fresh demo: forget what asky learned, so it asks about everything again (the MCP catalog is kept)
    if (fresh && known?.pages) await fetch("/api/reset", { method: "POST" });
    const s = await api.createSession("capture", person, { title: `Month-end queue (${EXPERTS.find((e) => e.id === person)?.name})` });
    setSid(s.id);
    setPhase("live");
    await fetch("/api/ap/sandbox/reset", { method: "POST" });
    frame.current?.reload();
    voice.start("interviewer").catch((e) => setStatus(`Voice: ${e.message}`));
  }

  // bridge messages are processed strictly in order
  const onBridge = useCallback((m: BridgeMsg) => {
    if (m.type === "asky:ui" && m.action === "input") {
      it.touch();
      return;
    }
    it.touch(m.type === "asky:api" && m.method !== "GET");
    if (!sid || phase !== "live") return;
    lastAppEvent.current = Date.now();
    queueRef.current = queueRef.current.then(async () => {
      const r = await api.events(sid, [m]).catch(() => null);
      if (!r) return;
      for (const e of r.events) {
        if (e.kind === "ui" && !/navigated/.test(e.summary)) continue;
        setFeed((f) => [{ id: e.id, ts: e.ts, text: e.summary, kind: e.kind, tag: e.tool }, ...f].slice(0, 200));
        if (e.kind === "tool") voice.context(e.summary);
      }
      if (r.questions.length) {
        it.enqueue(r.questions);
        setDecisions((d) => [...r.questions, ...d]);
      }
      if (r.recognized?.length) {
        const now = Date.now();
        setRecognized((x) => [...r.recognized!.filter((n) => !x.some((y) => y.eventId === n.eventId && y.pageId === n.pageId)).map((n) => ({ ...n, ts: now })), ...x]);
      }
    });
  }, [sid, phase, it, voice]);

  const onGate = useCallback(async (m: GateMsg) => {
    if (!sid || phase !== "live") return { allow: true };
    await Promise.race([queueRef.current, new Promise((r) => setTimeout(r, 1500))]); // events before the click are in (never wait forever)
    const g = await api.gate(sid, { method: m.method, path: m.path, body: m.body }).catch(() => ({ allow: true } as const));
    if (g.allow || !("hold" in g) || !g.hold) return { allow: true };
    setStatus(`Holding "${g.tool}" — one question first`);
    await it.askNow(g.hold.question);
    setStatus("");
    return { allow: true }; // asked & answered → the expert's action goes through
  }, [sid, phase, it]);

  async function endTask() {
    if (!sid) return;
    setPhase("debrief");
    share.stop();
    setStatus("Preparing the debrief…");
    const { questions } = await api.debrief(sid);
    setStatus(`Debrief: ${questions.length} questions`);
    for (const q of questions) await it.askNow(q);
    await runTeachBack();
  }

  async function runTeachBack(corrections?: string) {
    if (!sid) return;
    setPhase("teachback");
    setStatus("Writing the teach-back…");
    const tb = corrections ? (await api.confirm(sid, false, corrections)).again! : await api.teachBack(sid);
    setTeachBack(tb.text);
    setStatus("");
    const answer = await it.askNow(teachBackQuestion(sid, tb.text), "say");
    if (!answer || /^(yes|yeah|yep|correct|right|exactly|genau|ja|that'?s (right|it|how it works))/i.test(answer.trim())) await confirm();
    else await runTeachBack(answer);
  }

  async function confirm() {
    if (!sid) return;
    setStatus("Saving to the knowledge hub…");
    const r = await api.confirm(sid, true);
    setResult(r.committed?.changed ?? []);
    setPhase("done");
    setStatus("");
    voice.say("Thank you! I've written it down for the next person.", "say");
    setTimeout(() => voice.stop(), 5000);
  }

  const active = it.state.active;
  const liveAsked = decisions.filter((q) => q.timing !== "debrief").length;

  return (
    <Shell full right={phase !== "setup" && <PhasePill phase={phase} />}>
      <div className="flex h-full gap-3 p-3">
        <div className="relative min-w-0 flex-1">
          {phase === "setup" ? (
            <SetupCard person={person} setPerson={setPerson} onStart={start} known={known} fresh={fresh} setFresh={setFresh} />
          ) : (
            <AppFrame ref={frame} src="/app" onBridge={onBridge} onGate={onGate} privacyBlur={blur} />
          )}
          {it.state.offRecord && <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg bg-stone-900/40 text-2xl font-semibold text-white">Off the record</div>}
        </div>

        <aside className="flex w-[430px] shrink-0 flex-col gap-3 overflow-hidden">
          {/* apprentice state */}
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Orb speaking={voice.agentSpeaking} listening={voice.userSpeaking} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {phase === "setup" ? "Ready when you are" : voice.agentSpeaking ? "Asking…" : active ? "Listening for your answer" : it.state.queue.length ? (it.state.isPause ? "Pause detected" : "Waiting for a natural pause") : "Watching quietly"}
                </div>
                <div className="truncate text-xs text-stone-500">{status || `${voice.engine} voice · ${voice.status}`}</div>
              </div>
              {phase === "live" && <button onClick={endTask} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm text-white">End task → debrief</button>}
            </div>
            {phase === "live" && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[11px] text-stone-500"><span>quiet for {(it.state.pauseFor / 1000).toFixed(1)}s</span><span>pause ≥ 1.8s</span></div>
                <div className="h-1.5 overflow-hidden rounded bg-stone-100"><div className={`h-full transition-all ${it.state.isPause ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${Math.min(100, (it.state.pauseFor / 1800) * 100)}%` }} /></div>
              </div>
            )}
            {active && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">“{active.text}”</div>}
            {phase === "live" && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <button onClick={() => (share.sharing ? share.stop() : share.start().catch((e) => setStatus(e.message)))} className="rounded-md border border-stone-300 px-2 py-1">{share.sharing ? "■ Stop screen share" : "● Share screen"}</button>
                <button onClick={async () => { const on = !it.state.offRecord; if (sid) await api.offRecord(sid, on); voice.typeAnswer(on ? "off the record" : "back on the record"); }} className="rounded-md border border-stone-300 px-2 py-1">{it.state.offRecord ? "Back on the record" : "Off the record"}</button>
                <label className="flex items-center gap-1 rounded-md border border-stone-300 px-2 py-1"><input type="checkbox" checked={blur} onChange={(e) => { setBlur(e.target.checked); frame.current?.setPrivacy(e.target.checked); }} /> blur personal data</label>
                {active && <button onClick={it.skipActive} className="rounded-md border border-stone-300 px-2 py-1">skip question</button>}
              </div>
            )}
            {(phase === "live" || phase === "debrief" || phase === "teachback") && (
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { voice.typeAnswer(typed.trim()); setTyped(""); } }}>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={active ? "Type your answer (or just speak)" : "Say something to asky…"} className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1 text-sm" />
                <button className="rounded-md bg-stone-200 px-2 text-sm">↵</button>
              </form>
            )}
          </div>

          {phase === "teachback" && teachBack && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">Teach-back</div>
              <p className="text-indigo-950">{teachBack}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => voice.typeAnswer("Yes, that's right.")} className="rounded-md bg-indigo-700 px-3 py-1 text-white">Yes, that&apos;s how it works</button>
                <span className="self-center text-xs text-indigo-700">…or say what to correct</span>
              </div>
            </div>
          )}

          {phase === "done" && result && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <div className="mb-2 font-semibold text-emerald-900">Saved to the knowledge hub</div>
              <ul className="space-y-1">
                {result.map((c) => <li key={c.pageId}><Link className="underline" href={`/hub/pages/${c.pageId}`}>{c.title}</Link> <span className="text-emerald-700">{c.created ? "new" : c.added.join(", ")}</span></li>)}
              </ul>
              <div className="mt-3 flex gap-3">
                <Link href={`/hub/sessions/${sid}`} className="rounded-md bg-emerald-700 px-3 py-1 text-white">Open Work Map →</Link>
                <Link href="/hub/graph" className="rounded-md border border-emerald-700 px-3 py-1 text-emerald-800">Process graph</Link>
              </div>
            </div>
          )}

          <Tabs
            tabs={{
              Questions: (
                <div className="space-y-2">
                  <div className="text-[11px] text-stone-500">{liveAsked} live · {it.state.debrief.length} for debrief · budget 5 / 10 min</div>
                  {[...decisions.map((q) => ({ ts: q.ts, el: <DecisionCard key={q.id} q={q} asked={it.state.asked.find((a) => a.id === q.id)} /> })),
                    ...recognized.map((r) => ({ ts: r.ts, el: <KnownCard key={r.eventId + r.pageId} r={r} /> }))]
                    .sort((a, b) => b.ts - a.ts).map((x) => x.el)}
                  {!decisions.length && !recognized.length && <Empty text="No questions yet. Work normally — asky only asks about judgment calls." />}
                </div>
              ),
              Events: (
                <ul className="space-y-1 text-xs">
                  {feed.map((f) => (
                    <li key={f.id} className="flex gap-2"><span className="text-stone-400 tabular-nums">{new Date(f.ts).toLocaleTimeString()}</span><span className={f.kind === "external" ? "text-violet-700" : ""}>{f.text}</span>{f.tag && <span className="ml-auto rounded bg-stone-100 px-1 font-mono text-[10px] text-stone-500">{f.tag}</span>}</li>
                  ))}
                  {!feed.length && <Empty text="Screen events appear here, mapped onto the app's MCP tools." />}
                </ul>
              ),
              Transcript: (
                <ul className="space-y-2 text-sm">
                  {transcript.map((t, k) => <li key={k}><span className={`mr-1 text-xs font-semibold ${t.who === "asky" ? "text-amber-700" : "text-stone-700"}`}>{t.who === "asky" ? "asky" : "you"}</span>{t.text}</li>)}
                  {!transcript.length && <Empty text="Speech is transcribed here. Say “off the record” to pause capture." />}
                </ul>
              ),
            }}
          />
        </aside>
      </div>
    </Shell>
  );
}

function DecisionCard({ q, asked }: { q: Question; asked?: Question }) {
  const d = q.decision;
  return (
    <div className="rounded-lg border border-stone-200 p-2.5 text-sm">
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={`rounded px-1.5 py-0.5 font-medium ${q.timing === "debrief" ? "bg-stone-100 text-stone-600" : "bg-amber-100 text-amber-800"}`}>{q.timing === "debrief" ? "→ debrief" : q.timing === "pre_commit" ? "before commit" : "live"}</span>
        {d && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">{d.deviationType}</span>}
        {d && <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-stone-600">{d.engine} {d.latencyMs}ms</span>}
        <span className="text-stone-500">importance {q.importance.toFixed(2)}</span>
      </div>
      <div className="text-stone-800">{q.text}</div>
      {q.deviation && <div className="mt-1 text-xs text-stone-500">{q.deviation.detail}</div>}
      {d?.fellBack && <div className="mt-1 text-[11px] text-stone-400">{d.fellBack}</div>}
      {asked?.answer && <div className="mt-1.5 border-l-2 border-emerald-400 pl-2 text-xs text-stone-700">“{asked.answer}”</div>}
    </div>
  );
}

function Tabs({ tabs }: { tabs: Record<string, React.ReactNode> }) {
  const keys = Object.keys(tabs);
  const [k, setK] = useState(keys[0]);
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex gap-1 border-b border-stone-100 p-1.5">
        {keys.map((x) => <button key={x} onClick={() => setK(x)} className={`rounded-md px-2.5 py-1 text-xs ${k === x ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}>{x}</button>)}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{tabs[k]}</div>
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <div className="py-6 text-center text-xs text-stone-400">{text}</div>;

function PhasePill({ phase }: { phase: Phase }) {
  const steps: Phase[] = ["live", "debrief", "teachback", "done"];
  return (
    <div className="flex items-center gap-1 text-[11px]">
      {steps.map((s) => <span key={s} className={`rounded-full px-2 py-0.5 ${s === phase ? "bg-amber-400 text-stone-900" : steps.indexOf(s) < steps.indexOf(phase) ? "bg-stone-300 text-stone-700" : "bg-stone-100 text-stone-400"}`}>{s}</span>)}
    </div>
  );
}

function KnownCard({ r }: { r: Recognized }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 text-sm">
      <div className="mb-0.5 text-[11px] font-medium text-emerald-700">✓ already known — no need to ask</div>
      <div className="text-stone-700">{r.summary}</div>
      <Link href={`/hub/pages/${r.pageId}`} target="_blank" className="text-xs text-emerald-800 underline">{r.title}</Link>
    </div>
  );
}

function SetupCard({ person, setPerson, onStart, known, fresh, setFresh }: { person: string; setPerson: (p: string) => void; onStart: () => void; known: { pages: number; titles: string[] } | null; fresh: boolean; setFresh: (f: boolean) => void }) {
  return (
    <div className="grid h-full place-items-center rounded-lg border border-dashed border-stone-300 bg-white">
      <div className="max-w-md space-y-4 p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Capture a real task</h1>
        <p className="text-sm text-stone-600">Work your invoice queue as usual. asky watches the screen, stays quiet while you type or talk, and asks a short question at natural pauses — only about judgment calls and guardrails. Small things wait for the debrief.</p>
        <label className="block text-sm">Expert
          <select value={person} onChange={(e) => setPerson(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5">
            {EXPERTS.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        {!!known?.pages && (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <div className="text-amber-900">asky already knows <b>{known.pages} situations</b> ({known.titles.slice(0, 2).join(", ")}{known.pages > 2 ? ", …" : ""}). It only asks about what is new.</div>
            <label className="flex items-start gap-2"><input type="radio" checked={fresh} onChange={() => setFresh(true)} className="mt-1" /><span><b>Fresh demo</b> — forget what asky learned, so it asks about the judgment calls again</span></label>
            <label className="flex items-start gap-2"><input type="radio" checked={!fresh} onChange={() => setFresh(false)} className="mt-1" /><span><b>Continue</b> — keep the knowledge; asky stays quiet on known situations and asks only about new ones</span></label>
          </div>
        )}
        <ul className="list-disc space-y-1 pl-5 text-xs text-stone-500">
          <li>Say <b>“off the record”</b> any time — nothing is stored until you say “back on the record”.</li>
          <li>IBANs and e-mails are blurred on screen and redacted from the transcript.</li>
          <li>Share your screen to give asky screen moments and to follow you into Excel or Outlook.</li>
        </ul>
        <button onClick={onStart} className="w-full rounded-lg bg-stone-900 py-2.5 font-medium text-white">Start session</button>
      </div>
    </div>
  );
}
