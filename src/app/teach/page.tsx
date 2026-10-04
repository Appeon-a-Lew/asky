"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AppFrame, { type AppFrameHandle, type BridgeMsg, type GateMsg } from "@/components/AppFrame";
import Orb from "@/components/Orb";
import ScreenView from "@/components/ScreenView";
import Shell from "@/components/Shell";
import { type FrameResult, useScreenShare } from "@/components/useScreenShare";
import { useVoice, VoiceProvider } from "@/components/voice/VoiceProvider";
import { api, j, type GateResponse } from "@/lib/client";

type Block = NonNullable<GateResponse["violations"]>[number] & { tool?: string; at: number; stage?: "confirm" | "saved" | "left" };
const BLOCK_LABEL = { confirm: "Stopped before saving", saved: "Flagged right after saving", left: "Left unfinished" };
type Target = "ledgerline" | "erpnext";
type Mastery = { pageId: string; title: string; level: "new" | "practicing" | "mastered"; lessonId?: string };

export default function TeachPage() {
  return (
    <VoiceProvider>
      <Teach />
    </VoiceProvider>
  );
}

function selectorFor(reason: string) {
  if (/costCenterType|hasAssetNumber|cost center/i.test(reason)) return "#coding-panel";
  if (/approv/i.test(reason)) return "#actions-panel";
  if (/supplier history/i.test(reason)) return "[data-field=supplier]";
  return "#actions-panel";
}

function Teach() {
  const voice = useVoice();
  const [sid, setSid] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [chat, setChat] = useState<{ who: "tutor" | "you"; text: string }[]>([]);
  const [predict, setPredict] = useState<{ pageId: string; question: string; caseId: string } | null>(null);
  const [result, setResult] = useState<{ mastery: Mastery[]; practice: Mastery[]; caught: unknown[]; casesWorked: string[] } | null>(null);
  const [typed, setTyped] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [target, setTarget] = useState<Target>("ledgerline");
  const picked = useRef(false);
  const [erpUp, setErpUp] = useState<{ up: boolean; url: string | null; visitor?: boolean } | null>(null);
  const [screen, setScreen] = useState<FrameResult["screen"]>(null);
  const frame = useRef<AppFrameHandle>(null);
  const asked = useRef(new Set<string>());
  const predictRef = useRef(predict);
  const sidRef = useRef(sid);
  const caseRef = useRef(caseId);
  useEffect(() => {
    predictRef.current = predict;
    sidRef.current = sid;
    caseRef.current = caseId;
  }, [predict, sid, caseId]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  /** urgent: a guardrail warning — it interrupts anything else the tutor is saying, and nothing interrupts it */
  const tutorSay = useCallback((text: string, urgent = false) => {
    setChat((c) => [...c, { who: "tutor", text }]);
    return voice.say(text, "say", urgent);
  }, [voice]);

  useEffect(() => {
    j<{ up: boolean; url: string | null; visitor?: boolean }>("GET", "/api/erpnext").then((e) => { setErpUp(e); if (e.up && !picked.current) setTarget("erpnext"); }).catch(() => {});
  }, []);

  async function start() {
    if (target === "erpnext") {
      // screen share first: the browser only allows it right after the click
      try {
        await share.start();
      } catch {
        return;
      }
      await fetch("/api/erpnext", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "training" }) });
    } else {
      await fetch("/api/ap/sandbox/reset", { method: "POST" });
    }
    const s = await api.createSession("teach", "lena", { trainingCaseIds: ["5101", "5102", "5103", "5104"], title: `Training${target === "erpnext" ? " in ERPNext" : ""} · Lena Hoffmann`, target });
    sidRef.current = s.id;
    setSid(s.id);
    const k = await j<{ pages: { title: string; triggerText: string; steps: { text: string }[]; guardrails: { text: string }[]; why: { text: string }[] }[] }>("GET", "/api/knowledge");
    const roleContext = "You are the tutor. Knowledge: " + k.pages.map((p) => `${p.title} — when ${p.triggerText}: ${p.steps.map((s) => s.text).join("; ")}. Guardrails: ${p.guardrails.map((g) => g.text).join("; ")}. Expert said: "${p.why[0]?.text ?? ""}"`).join(" | ");
    voice.start("tutor", roleContext).catch(() => {});
  }

  // learner speech: prediction answers, or questions to the tutor (with or without an open invoice)
  useEffect(() => voice.onUtterance(async (u) => {
    const s = sidRef.current;
    if (!s) return;
    setChat((c) => [...c, { who: "you", text: u.text }]);
    api.utter(s, { speaker: "learner", text: u.text }).catch(() => {});
    const p = predictRef.current;
    if (p) {
      predictRef.current = null;
      setPredict(null);
      const r = await j<{ correct: boolean; feedback: string }>("POST", "/api/teach/judge", { sessionId: s, pageId: p.pageId, answer: u.text });
      tutorSay(r.feedback);
      return;
    }
    setThinking(true);
    const r = await j<{ answer: string | null }>("POST", "/api/teach/ask", { question: u.text, caseId: caseRef.current ?? undefined }).catch(() => ({ answer: null }));
    setThinking(false);
    if (r.answer) tutorSay(r.answer);
  }), [voice, tutorSay]);

  // first time the learner opens a case a page covers → ask for a prediction (never blocks the event queue)
  const maybePredict = useCallback(async (caseId: string) => {
    if (asked.current.has(caseId)) return;
    asked.current.add(caseId);
    const pr = await j<{ pageId: string; question: string } | null>("GET", `/api/teach/predict?caseId=${caseId}`).catch(() => null);
    if (!pr) return;
    predictRef.current = { ...pr, caseId };
    setPredict({ ...pr, caseId });
    tutorSay(pr.question);
  }, [tutorSay]);

  const onBridge = useCallback((m: BridgeMsg) => {
    if (m.type === "asky:ui" && m.action === "input") { voice.activity(); return; }
    const s = sidRef.current;
    if (!s) return;
    queue.current = queue.current.then(async () => {
      const r = await api.events(s, [m]).catch(() => null);
      for (const e of r?.events ?? []) {
        if (e.kind === "tool") voice.context(e.summary);
        if (e.caseId && e.caseId !== caseRef.current) {
          caseRef.current = e.caseId;
          setCaseId(e.caseId);
        }
        if (e.tool === "get_invoice" && e.caseId) void maybePredict(e.caseId);
      }
    });
  }, [voice, maybePredict]);

  const onGate = useCallback(async (m: GateMsg) => {
    const s = sidRef.current;
    if (!s) return { allow: true };
    await Promise.race([queue.current, new Promise((r) => setTimeout(r, 1500))]); // never wait forever
    const g = await api.gate(s, { method: m.method, path: m.path, body: m.body }).catch(() => ({ allow: true } as GateResponse));
    if (g.allow || !g.violations?.length) return { allow: true };
    const v = g.violations[0];
    setBlocks((b) => [{ ...v, tool: g.tool, at: Date.now() }, ...b]);
    frame.current?.highlight(selectorFor(v.reason));
    const expert = v.expert === "sabine" ? "Sabine" : v.expert ?? "the expert";
    void tutorSay(`Hold on — before you ${g.tool?.replace(/_/g, " ").replace("invoice", "this invoice")}: ${v.guardrail.text}.${v.quote ? ` ${expert} told me: "${v.quote}"` : ""}`, true);
    setTimeout(() => frame.current?.highlight(null), 6000);
    return { allow: false, message: `Stopped by your tutor: ${v.guardrail.text}` };
  }, [tutorSay]);

  // real app (ERPNext): the tutor sees the learner's shared screen; the confirm dialog is the last moment before a save
  const share = useScreenShare({
    sessionId: sid,
    lastAppEventAt: () => 0,
    width: 1600,
    alwaysDescribe: true,
    onActivity: () => voice.activity(),
    onResult: (r) => {
      if (r.screen) setScreen(r.screen);
      for (const e of (r.events ?? []) as { caseId?: string; tool?: string; kind: string; summary: string }[]) {
        if (e.kind === "tool") voice.context(e.summary);
        if (e.caseId && e.caseId !== caseRef.current) {
          caseRef.current = e.caseId;
          setCaseId(e.caseId);
        }
        if (e.tool === "get_invoice" && e.caseId) void maybePredict(e.caseId);
      }
      const b = r.block;
      const v = b?.violations?.[0] as Block | undefined;
      if (b && v) {
        setBlocks((x) => [{ ...v, tool: b.tool, stage: b.stage, at: Date.now() }, ...x]);
        const expert = v.expert === "sabine" ? "Sabine" : v.expert ?? "the expert";
        // a real app saves without asking: after the fact, the tutor says what is still missing before it can be posted
        const lead = b.stage === "saved" ? `Hold on — invoice ${b.invoice} isn't ready to post yet.` : b.stage === "left" ? `Before you move on — invoice ${b.invoice} isn't finished.` : "Stop — don't click Yes.";
        void tutorSay(`${lead} ${v.guardrail.text.replace(/\.$/, "")}.${v.quote ? ` ${expert} told me: "${v.quote}"` : ""}`, true);
      }
    },
  });

  async function finish() {
    if (!sid) return;
    share.stop();
    const r = await j<typeof result>("POST", "/api/teach/finish", { sessionId: sid });
    setResult(r);
    voice.stop();
  }

  return (
    <Shell full>
      <div className="flex h-full gap-3 p-3">
        <div className="min-w-0 flex-1">
          {sid && target === "erpnext" ? (
            <ScreenView frame={share.lastFrame} sharing={share.sharing} screen={screen} url={erpUp?.url ?? "http://localhost:8080"} onShare={() => share.start().catch(() => {})} />
          ) : sid ? (
            <AppFrame ref={frame} src="/app?training=1" onBridge={onBridge} onGate={onGate} />
          ) : (
            <div className="grid h-full place-items-center rounded-2xl border border-stone-200/80 bg-white bg-[radial-gradient(ellipse_at_top,#fef3c7_0%,transparent_60%)]">
              <div className="max-w-md space-y-4 p-8">
                <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-stone-900">Practice with your tutor</h1>
                <p className="text-sm text-stone-600">You are <b>Lena</b>, new in accounts payable. Work four invoices Sabine never showed. Your tutor watches your screen, asks you to predict her decisions, and steps in <i>before</i> a wrong decision is saved — explaining it with Sabine&apos;s own words.</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {(["ledgerline", "erpnext"] as const).map((t) => (
                    <button key={t} type="button" disabled={t === "erpnext" && !erpUp?.up} onClick={() => { picked.current = true; setTarget(t); }} className={`rounded-xl border p-3 text-left transition disabled:opacity-50 ${target === t ? "border-stone-900 bg-white ring-1 ring-stone-900" : "border-stone-200 bg-white/70 hover:border-stone-400"}`}>
                      <div className="text-sm font-semibold text-stone-900">{t === "erpnext" ? "ERPNext" : "Ledgerline AP"}</div>
                      <div className="text-stone-600">{t === "erpnext" ? (erpUp?.up ? "Real ERP — share your ERPNext tab; open invoices 5101–5104." : erpUp?.visitor ? "Presenter only" : "not reachable") : "Mock ERP, instrumented."}</div>
                    </button>
                  ))}
                </div>
                <button onClick={start} className="w-full rounded-xl bg-stone-900 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800">Start training</button>
              </div>
            </div>
          )}
        </div>

        <aside className="flex w-[420px] shrink-0 flex-col gap-3 overflow-hidden">
          <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(28,27,24,0.04)]">
            <div className="flex items-center gap-3">
              <Orb speaking={voice.agentSpeaking} listening={voice.userSpeaking} />
              <div className="flex-1">
                <div className="text-sm font-medium">{predict ? "Your prediction?" : voice.agentSpeaking ? "Tutor speaking" : thinking ? "Thinking…" : "Tutor watching"}</div>
                <div className="text-xs text-stone-500">{caseId ? `invoice ${caseId}` : "open an invoice"} · {voice.engine} voice</div>
              </div>
              {sid && !result && <button onClick={finish} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-stone-800">Finish</button>}
            </div>
            {predict && <div className="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-950">{predict.question}</div>}
            {sid && (
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { voice.typeAnswer(typed.trim()); setTyped(""); } }}>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={predict ? "Type your prediction (or say it)" : "Ask your tutor…"} className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
                <button className="rounded-md bg-stone-200 px-2 text-sm">↵</button>
              </form>
            )}
          </div>

          {blocks.map((b) => (
            <div key={b.at} className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm shadow-sm">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-rose-700">{BLOCK_LABEL[b.stage ?? "confirm"]} · {b.tool}</div>
              <div className="font-medium text-rose-950">{b.guardrail.text}</div>
              <div className="mt-1 text-xs text-rose-800">{b.reason}</div>
              {b.quote && <blockquote className="mt-2 border-l-2 border-amber-400 pl-2 italic text-stone-800">“{b.quote}” <span className="not-italic text-xs text-stone-500">— Sabine</span></blockquote>}
              {b.frameId && (
                <details className="mt-2"><summary className="cursor-pointer text-xs text-sky-700">▶ replay Sabine&apos;s screen moment</summary>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/frame-id/${b.frameId}`} alt="expert screen" className="mt-1 rounded border border-stone-200" />
                </details>
              )}
              <Link href={`/hub/pages/${b.pageId}`} className="mt-2 inline-block text-xs text-sky-700 underline">open page: {b.pageTitle}</Link>
            </div>
          ))}

          {result && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <div className="mb-2 font-semibold">Your progress</div>
              <ul className="space-y-1">{result.mastery.map((m) => <li key={m.pageId}>{m.level === "mastered" ? "✅" : m.level === "practicing" ? "🟡" : "⚪"} {m.title} <span className="text-xs text-stone-500">{m.level}</span></li>)}</ul>
              {result.practice.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-stone-600">Practice next</div>
                  {result.practice.map((m) => <Link key={m.pageId} href={`/hub/lessons/${m.lessonId}`} className="block text-sky-700 underline">{m.title}</Link>)}
                </div>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-stone-200/80 bg-white p-3 text-sm shadow-[0_1px_2px_rgba(28,27,24,0.04)]">
            {chat.map((c, k) => <div key={k} className="mb-2"><span className={`mr-1 text-xs font-semibold ${c.who === "tutor" ? "text-amber-700" : "text-stone-700"}`}>{c.who}</span>{c.text}</div>)}
            {!chat.length && <div className="py-6 text-center text-xs text-stone-400">Ask anything, e.g. “Why does this need the controller?”</div>}
          </div>
        </aside>
      </div>
    </Shell>
  );
}
