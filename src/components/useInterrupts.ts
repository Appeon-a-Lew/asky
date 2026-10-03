"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { Question } from "@/lib/types";
import type { Voice } from "./voice/VoiceProvider";

// "When to ask": the question is decided server-side (Jev/rules) and phrased
// in advance; this hook waits for a natural pause and enforces the budget.
//   pause = no typing/clicking for pauseMs AND nobody speaking AND agent quiet
//   right after a save/submit the threshold is shorter (natural boundary)
// Pre-commit holds (gate) bypass the pause: the expert is waiting anyway.

const OFF = /\b(off the record|nicht aufnehmen)\b/i;
const ON = /\b(back on (the )?record|on the record again|wieder aufnehmen)\b/i;

export interface InterruptState {
  pauseFor: number; // ms since last activity
  isPause: boolean;
  active: Question | null;
  queue: Question[];
  debrief: Question[];
  asked: Question[];
  offRecord: boolean;
}

export function useInterrupts(opts: {
  sessionId: string | null;
  voice: Voice;
  speaker: "expert" | "learner";
  pauseMs: number;
  budgetPer10Min: number;
  enabled: boolean;
  onOffRecord?: (on: boolean) => void;
  onAsk?: (q: Question) => void;
}) {
  const { sessionId, voice, speaker, pauseMs, budgetPer10Min, enabled } = opts;
  const lastInput = useRef(0);
  const lastBoundary = useRef(0);
  const [state, setState] = useState<InterruptState>({ pauseFor: 0, isPause: false, active: null, queue: [], debrief: [], asked: [], offRecord: false });
  const st = useRef(state);
  useEffect(() => {
    st.current = state;
  }, [state]);
  const answerWaiters = useRef<((answer: string) => void)[]>([]);
  const answerBuf = useRef<{ text: string; lastAt: number } | null>(null);
  const askedTimes = useRef<number[]>([]);
  const busy = useRef(false);
  const onOffRef = useRef(opts.onOffRecord);
  const onAskRef = useRef(opts.onAsk);
  useEffect(() => {
    onOffRef.current = opts.onOffRecord;
    onAskRef.current = opts.onAsk;
  });
  useEffect(() => {
    lastInput.current = Date.now();
  }, []);

  const touch = useCallback((boundary = false) => {
    lastInput.current = Date.now();
    if (boundary) lastBoundary.current = Date.now();
    voice.activity();
  }, [voice]);

  const enqueue = useCallback((qs: Question[]) => {
    if (!qs.length) return;
    for (const q of qs) if (q.timing !== "debrief") voice.prepare(q.text); // speech ready before the pause
    setState((s) => ({
      ...s,
      queue: [...s.queue, ...qs.filter((q) => q.timing !== "debrief")].sort((a, b) => b.importance - a.importance),
      debrief: [...s.debrief, ...qs.filter((q) => q.timing === "debrief")],
    }));
  }, [voice]);

  /** Ask immediately and resolve with the answer (used for gate holds, debrief). */
  const askNow = useCallback(async (q: Question, kind: "ask" | "say" = "ask"): Promise<string> => {
    if (!sessionId) return "";
    busy.current = true;
    st.current = { ...st.current, active: q };
    setState((s) => ({ ...s, active: q, queue: s.queue.filter((x) => x.id !== q.id) }));
    onAskRef.current?.(q);
    askedTimes.current.push(Date.now());
    if (q.kind !== "teachback") await api.question(sessionId, q.id, { status: "asked" }).catch(() => {});
    // listen before speaking: an answer may start while the question is still being said
    const answered = new Promise<string>((resolve) => answerWaiters.current.push(resolve));
    await api.utter(sessionId, { speaker: "agent", text: q.text, questionId: q.id });
    await voice.say(q.text, kind);
    const answer = await answered;
    setState((s) => ({ ...s, active: null, asked: [...s.asked, { ...q, status: "answered", answer }] }));
    busy.current = false;
    return answer;
  }, [sessionId, voice]);

  const skipActive = useCallback(() => {
    const w = answerWaiters.current.splice(0);
    w.forEach((f) => f(""));
    answerBuf.current = null;
  }, []);

  // utterances → transcript, answers, privacy commands
  useEffect(() => {
    return voice.onUtterance(async (u) => {
      if (!sessionId) return;
      lastInput.current = Date.now();
      if (OFF.test(u.text)) {
        await api.offRecord(sessionId, true);
        setState((s) => ({ ...s, offRecord: true }));
        onOffRef.current?.(true);
        return;
      }
      if (ON.test(u.text)) {
        await api.offRecord(sessionId, false);
        setState((s) => ({ ...s, offRecord: false }));
        onOffRef.current?.(false);
        return;
      }
      if (st.current.offRecord) return;
      const active = st.current.active;
      await api.utter(sessionId, { speaker, text: u.text, questionId: active?.id, ts: u.ts });
      if (active) {
        if (voice.agentSpeaking) voice.hush(); // they already answer — stop talking
        answerBuf.current = { text: `${answerBuf.current?.text ?? ""} ${u.text}`.trim(), lastAt: Date.now() };
      }
    });
  }, [voice, sessionId, speaker]);

  // the loop: pause detection, answer completion, asking
  useEffect(() => {
    const t = setInterval(async () => {
      const now = Date.now();
      const since = Math.min(now - lastInput.current, now - (voice.lastUserSpeechAt || 0));
      const threshold = now - lastBoundary.current < 4000 ? Math.min(1000, pauseMs) : pauseMs;
      const isPause = since > threshold && !voice.agentSpeaking && !voice.userSpeaking;
      setState((s) => (s.isPause === isPause && Math.abs(s.pauseFor - since) < 200 ? s : { ...s, pauseFor: since, isPause }));

      // answer complete: some words + 2.2 s of silence
      const buf = answerBuf.current;
      const short = /^(yes|yeah|yep|yup|no|nope|correct|right|exactly|sure|ja|jein|nein|genau|evet|hayır|doğru)\b/i;
      if (buf && now - buf.lastAt > 2200 && (buf.text.split(/\s+/).length >= 2 || short.test(buf.text)) && !voice.userSpeaking) {
        answerBuf.current = null;
        answerWaiters.current.splice(0).forEach((f) => f(buf.text));
      }

      const s = st.current;
      if (!enabled || busy.current || s.active || !s.queue.length || !isPause || s.offRecord || !sessionId) return;
      const q = s.queue[0];
      // budget: Ask less, later
      askedTimes.current = askedTimes.current.filter((x) => now - x < 600_000);
      if (askedTimes.current.length >= budgetPer10Min) {
        setState((x) => ({ ...x, queue: x.queue.slice(1), debrief: [...x.debrief, { ...q, timing: "debrief" }] }));
        api.question(sessionId, q.id, { timing: "debrief" }).catch(() => {});
        return;
      }
      askNow(q);
    }, 250);
    return () => clearInterval(t);
  }, [enabled, voice, pauseMs, budgetPer10Min, sessionId, askNow]);

  return { state, touch, enqueue, askNow, skipActive, lastInputAt: () => lastInput.current };
}
