"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AppFrame, { type AppFrameHandle, type BridgeMsg, type GateMsg } from "@/components/AppFrame";
import Orb from "@/components/Orb";
import ScreenView from "@/components/ScreenView";
import Shell from "@/components/Shell";
import { useInterrupts } from "@/components/useInterrupts";
import { type FrameResult, useScreenShare } from "@/components/useScreenShare";
import { useVoice, VoiceProvider } from "@/components/voice/VoiceProvider";
import { api, j, type Recognized } from "@/lib/client";
import type { Question } from "@/lib/types";

type Phase = "setup" | "live" | "debrief" | "teachback" | "done";
type Target = "ledgerline" | "erpnext";
type ErpStatus = { url: string; up: boolean; catalog: { tools: number; aligned: number; of: number } | null };
type FeedItem = { id: string; ts: number; text: string; kind: string; tag?: string };

const EXPERTS = [
  { id: "sabine", name: "Sabine Weber" },
  { id: "thomas", name: "Thomas Brandt" },
];

/** The teach-back is spoken like a question: the expert's reply confirms or corrects it. */
/** "Yes, that is correct" / "yeah that's how it works" — but not "yes, but the threshold is net" */
function isConfirmation(answer: string) {
  const yes = /\b(yes|yeah|yep|yup|correct|right|exactly|that'?s (it|how it works)|ja|genau|stimmt|richtig)\b/i;
  const but = /\b(no|not|nope|wrong|but|except|actually|however|nein|nicht|falsch|aber)\b/i;
  return yes.test(answer) && !but.test(answer);
}

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
  const [target, setTarget] = useState<Target>("ledgerline");
  const picked = useRef(false);
  const [erp, setErp] = useState<ErpStatus | null>(null);
  const [screen, setScreen] = useState<FrameResult["screen"]>(null);
  const [typed, setTyped] = useState("");
  const [teachBack, setTeachBack] = useState<string | null>(null);
  const [result, setResult] = useState<{ pageId: string; title: string; created: boolean; added: string[] }[] | null>(null);
  const [status, setStatus] = useState("");
  const [followUps, setFollowUps] = useState<{ conflicts: { pageId: string; title: string; summary: string }[]; blacklist: { id: string; action: "add" | "remove"; supplierName: string; quote: string }[] }>({ conflicts: [], blacklist: [] });
  const frame = useRef<AppFrameHandle>(null);
  const lastAppEvent = useRef(0);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const ended = useRef(false); // "Finish": stop asking, never commit

  const it = useInterrupts({
    sessionId: sid, voice, speaker: "expert", pauseMs: 1800, budgetPer10Min: 5, enabled: phase === "live",
    onOffRecord: (on) => setStatus(on ? "Off the record — nothing is captured" : "Back on the record"),
    onAsk: (q) => setTranscript((t) => [...t, { who: "asky", text: q.text, ts: q.ts }]),
  });

  useEffect(() => voice.onUtterance((u) => setTranscript((t) => [...t, { who: "expert", text: u.text, ts: u.ts }])), [voice]);

  const share = useScreenShare({
    sessionId: sid,
    lastAppEventAt: () => lastAppEvent.current,
    // a real app is only seen through the screen: more pixels, every change read, screen activity = busy
    width: target === "erpnext" ? 1600 : 960,
    alwaysDescribe: target === "erpnext",
    onActivity: () => target === "erpnext" && it.touch(),
    onResult: (r) => {
      if (r.screen) setScreen(r.screen);
      const qs = (r.questions ?? []) as Question[];
      if (qs.length) {
        it.enqueue(qs);
        setDecisions((d) => [...qs, ...d]);
      }
      for (const e of (r.events ?? []) as { id: string; ts: number; summary: string; kind: string; tool?: string }[]) {
        setFeed((f) => [{ id: e.id, ts: e.ts, text: e.summary, kind: e.kind, tag: e.tool ? `${e.tool} · vision` : "vision" }, ...f]);
        if (e.tool) voice.context(e.summary);
      }
      const rec = (r.recognized ?? []) as Recognized[];
      if (rec.length) {
        const now = Date.now();
        setRecognized((x) => [...rec.filter((n) => !x.some((y) => y.eventId === n.eventId && y.pageId === n.pageId)).map((n) => ({ ...n, ts: now })), ...x]);
      }
      // the confirm dialog of an irreversible step is open: one question before the expert clicks "Yes"
      if (r.hold) {
        const q = r.hold.question as Question;
        setStatus("Holding before you confirm — one question first");
        it.askNow(q).finally(() => setStatus(""));
      }
    },
  });

  useEffect(() => {
    j<{ pages: { title: string }[] }>("GET", "/api/knowledge").then((k) => setKnown({ pages: k.pages.length, titles: k.pages.map((p) => p.title) })).catch(() => {});
    // the real ERP is the default whenever it is running (Ledgerline stays one click away)
    j<ErpStatus>("GET", "/api/erpnext").then((e) => { setErp(e); if (e.up && !picked.current) setTarget("erpnext"); }).catch(() => {});
  }, []);

  async function start() {
    // screen share first: the browser only allows it right after the click
    if (target === "erpnext") {
      try {
        await share.start();
      } catch (e) {
        setStatus(`Screen share: ${(e as Error).message}`);
        return;
      }
    }
    // fresh demo: forget what asky learned, so it asks about everything again (the MCP catalogs are kept)
    if (fresh && known?.pages) await fetch("/api/reset", { method: "POST" });
    if (target === "erpnext") {
      setStatus("Resetting the ERPNext queue…");
      await fetch("/api/erpnext", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reset" }) });
      setStatus("");
    }
    const name = EXPERTS.find((e) => e.id === person)?.name;
    const s = await api.createSession("capture", person, { title: `Month-end queue${target === "erpnext" ? " in ERPNext" : ""} (${name})`, target });
    setSid(s.id);
    setPhase("live");
    if (target === "ledgerline") {
      await fetch("/api/ap/sandbox/reset", { method: "POST" });
      frame.current?.reload();
    }
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
    if (ended.current) return;
    setStatus(`Debrief: ${questions.length} questions`);
    for (const q of questions) {
      await it.askNow(q);
      if (ended.current) return;
    }
    await runTeachBack();
  }

  /** leave early: screen, voice and open questions stop; what was recorded stays under Sessions, nothing goes to the hub */
  async function finishNow() {
    if (!sid) return;
    if (!window.confirm("End this session now? What asky saw and heard stays under Sessions, but nothing is added to the knowledge hub.")) return;
    ended.current = true;
    share.stop();
    it.skipActive();
    voice.stop();
    await j("PATCH", `/api/sessions/${sid}`, { end: true }).catch(() => {});
    setStatus("");
    setTeachBack(null);
    setPhase("done");
  }

  async function runTeachBack(corrections?: string) {
    if (!sid) return;
    setPhase("teachback");
    setStatus("Writing the teach-back…");
    const tb = corrections ? (await api.confirm(sid, false, corrections)).again! : await api.teachBack(sid);
    if (ended.current) return;
    setTeachBack(tb.text);
    setStatus("");
    let answer = await it.askNow(teachBackQuestion(sid, tb.text), "say");
    if (ended.current) return;
    // side talk or a half sentence is not a correction: ask again (twice at most) instead of rewriting everything
    for (let k = 0; ; k++) {
      if (!answer || isConfirmation(answer)) return confirm();
      const { kind } = await api.teachBackReply(sid, answer).catch(() => ({ kind: "correct" as const }));
      if (ended.current) return;
      if (kind === "confirm") return confirm();
      if (kind === "correct" || k === 2) return runTeachBack(answer);
      answer = await it.askNow(teachBackQuestion(sid, "Sorry, I didn't catch that. Did I get it right, or what should I change?"), "say");
      if (ended.current) return;
    }
  }

  async function confirm() {
    if (!sid) return;
    setStatus("Saving to the knowledge hub…");
    const r = await api.confirm(sid, true);
    setResult(r.committed?.changed ?? []);
    setFollowUps({ conflicts: r.committed?.conflicts ?? [], blacklist: r.committed?.blacklist ?? [] });
    setPhase("done");
    setStatus("");
    voice.say("Thank you! I've written it down for the next person.", "say");
    setTimeout(() => voice.stop(), 5000);
  }

  const active = it.state.active;
  const liveAsked = decisions.filter((q) => q.timing !== "debrief").length;

  return (
    <Shell full>
      <div className="flex h-full gap-3 p-3">
        <div className="relative min-w-0 flex-1">
          {phase === "setup" ? (
            <SetupCard person={person} setPerson={setPerson} onStart={start} known={known} fresh={fresh} setFresh={setFresh} target={target} setTarget={(t) => { picked.current = true; setTarget(t); }} erp={erp} />
          ) : target === "erpnext" ? (
            <ScreenView frame={share.lastFrame} sharing={share.sharing} screen={screen} url={erp?.url ?? "http://localhost:8080"} onShare={() => share.start().catch((e) => setStatus(e.message))} />
          ) : (
            <AppFrame ref={frame} src="/app" onBridge={onBridge} onGate={onGate} privacyBlur={blur} />
          )}
          {it.state.offRecord && <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg bg-stone-900/40 text-2xl font-semibold text-white">Off the record</div>}
        </div>

        <aside className="flex w-[430px] shrink-0 flex-col gap-3 overflow-hidden">
          {/* apprentice state */}
          <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(28,27,24,0.04)]">
            {phase !== "setup" && <PhasePill phase={phase} />}
            <div className="flex items-center gap-3">
              <Orb speaking={voice.agentSpeaking} listening={voice.userSpeaking} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {phase === "setup" ? "Ready when you are" : voice.agentSpeaking ? "Asking…" : active ? "Listening for your answer" : it.state.queue.length ? (it.state.isPause ? "Pause detected" : "Waiting for a natural pause") : "Watching quietly"}
                </div>
                <div className="truncate text-xs text-stone-500">{status || `${voice.engine} voice · ${voice.status}`}</div>
              </div>
              {phase === "live" && <button onClick={endTask} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-stone-800">End task → debrief</button>}
              {(phase === "live" || phase === "debrief" || phase === "teachback") && <button onClick={finishNow} title="End now without the debrief" className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100">Finish</button>}
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
                <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={active ? "Type your answer (or just speak)" : "Say something to asky…"} className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
                <button className="rounded-md bg-stone-200 px-2 text-sm">↵</button>
              </form>
            )}
          </div>

          {phase === "teachback" && teachBack && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">Teach-back</div>
              <p className="text-indigo-950">{teachBack}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => voice.typeAnswer("Yes, that's right.")} className="rounded-md bg-indigo-700 px-3 py-1 text-white">Yes, that&apos;s how it works</button>
                <span className="self-center text-xs text-indigo-700">…or say what to correct</span>
              </div>
            </div>
          )}

          {phase === "done" && !result && (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm">
              <div className="mb-1 font-semibold text-stone-900">Session ended</div>
              <p className="text-stone-600">Nothing was added to the knowledge hub. What asky saw and heard is kept with the session.</p>
              <div className="mt-3 flex gap-3">
                <Link href={`/hub/sessions/${sid}`} className="rounded-md bg-stone-900 px-3 py-1 text-white">Open session →</Link>
                <button onClick={() => window.location.reload()} className="rounded-md border border-stone-300 px-3 py-1 text-stone-700">New session</button>
              </div>
            </div>
          )}

          {phase === "done" && result && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <div className="mb-2 font-semibold text-emerald-900">Saved to the knowledge hub</div>
              <ul className="space-y-1">
                {result.map((c) => <li key={c.pageId}><Link className="underline" href={`/hub/pages/${c.pageId}`}>{c.title}</Link> <span className="text-emerald-700">{c.created ? "new" : c.added.join(", ")}</span></li>)}
              </ul>
              {(followUps.conflicts.length > 0 || followUps.blacklist.length > 0) && (
                <div className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-white p-2.5 text-xs">
                  <div className="font-semibold text-amber-900">Needs a person</div>
                  {followUps.conflicts.map((c, k) => <div key={k}><Link className="underline" href={`/hub/pages/${c.pageId}`}>{c.title}</Link>: {c.summary}</div>)}
                  {followUps.blacklist.map((b) => <div key={b.id}>asky heard: {b.action === "add" ? "blacklist" : "take off the blacklist"} <b>{b.supplierName}</b> (“{b.quote}”) — <Link className="underline" href="/hub/blacklist">review</Link></div>)}
                </div>
              )}
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
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,27,24,0.04)]">
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
  const at = steps.indexOf(phase);
  return (
    <ol className="mb-4 grid grid-cols-4 gap-1 text-[11px] font-medium">
      {steps.map((s, k) => (
        <li key={s} className="space-y-1">
          <div className={`h-1 rounded-full ${k < at ? "bg-stone-800" : k === at ? "bg-amber-400" : "bg-stone-100"}`} />
          <div className={k === at ? "text-stone-900" : k < at ? "text-stone-500" : "text-stone-300"}>{s === "teachback" ? "teach-back" : s}</div>
        </li>
      ))}
    </ol>
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

function TargetOption({ on, onClick, title, tag, children, disabled }: { on: boolean; onClick: () => void; title: string; tag: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`rounded-xl border p-3 text-left text-xs transition ${on ? "border-stone-900 bg-white shadow-sm ring-1 ring-stone-900" : "border-stone-200 bg-white/70 hover:border-stone-400"} disabled:cursor-not-allowed disabled:opacity-50`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-stone-900">{title}</span>
        <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-500">{tag}</span>
      </div>
      <div className="text-stone-600">{children}</div>
    </button>
  );
}

function SetupCard({ person, setPerson, onStart, known, fresh, setFresh, target, setTarget, erp }: { person: string; setPerson: (p: string) => void; onStart: () => void; known: { pages: number; titles: string[] } | null; fresh: boolean; setFresh: (f: boolean) => void; target: Target; setTarget: (t: Target) => void; erp: ErpStatus | null }) {
  return (
    <div className="grid h-full place-items-center rounded-2xl border border-stone-200/80 bg-white bg-[radial-gradient(ellipse_at_top,#fef3c7_0%,transparent_60%)]">
      <div className="max-w-md space-y-4 p-8">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-stone-900">Capture a real task</h1>
        <p className="text-sm text-stone-600">Work your invoice queue as usual. asky watches the screen, stays quiet while you type or talk, and asks a short question at natural pauses — only about judgment calls and guardrails. Small things wait for the debrief.</p>
        <div className="grid grid-cols-2 gap-2">
          <TargetOption on={target === "ledgerline"} onClick={() => setTarget("ledgerline")} title="Ledgerline AP" tag="instrumented">Mock ERP inside asky. Every click and API call is reported exactly.</TargetOption>
          <TargetOption on={target === "erpnext"} onClick={() => setTarget("erpnext")} title="ERPNext" tag="vision only" disabled={!erp?.up}>
            {erp?.up ? <>A real ERP. asky only sees your shared screen{erp.catalog ? <> · MCP: {erp.catalog.aligned}/{erp.catalog.of} steps found</> : null}.</> : <>Not reachable at {erp?.url ?? "localhost:8080"}.</>}
          </TargetOption>
        </div>
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
          <li>{target === "erpnext" ? "You will be asked to share a screen — pick the ERPNext tab. Every change goes to the vision model; committed changes are confirmed through ERPNext's API." : "Share your screen to give asky screen moments and to follow you into Excel or Outlook."}</li>
        </ul>
        <button onClick={onStart} className="w-full rounded-xl bg-stone-900 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800">Start session</button>
      </div>
    </div>
  );
}
