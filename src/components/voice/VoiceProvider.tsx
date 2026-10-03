"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { FIRST_MESSAGE, type VoiceRole } from "@/lib/voice/prompts";

// One voice interface for the whole app:
//   - ElevenLabs agent (when ELEVENLABS_API_KEY + ELEVENLABS_AGENT_ID are set)
//   - browser speech (speechSynthesis + webkitSpeechRecognition) as fallback
// The app decides WHEN to talk (pause detection + Jev); the voice just talks.

export interface Utt {
  text: string;
  ts: number;
}

export interface Voice {
  engine: "elevenlabs" | "browser" | "text";
  status: "idle" | "connecting" | "live";
  agentSpeaking: boolean;
  userSpeaking: boolean;
  lastUserSpeechAt: number;
  start(role: VoiceRole, roleContext?: string): Promise<void>;
  stop(): void;
  say(text: string, kind?: "ask" | "say"): Promise<void>;
  prepare(text: string): void; // preload speech (question decided before the pause)
  hush(): void; // stop speaking now (the person started answering)
  context(text: string): void;
  activity(): void;
  typeAnswer(text: string): void; // text fallback / demo input
  onUtterance(cb: (u: Utt) => void): () => void;
}

const Ctx = createContext<Voice | null>(null);
export const useVoice = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVoice outside VoiceProvider");
  return v;
};

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<{ elevenlabs: boolean } | null>(null);
  useEffect(() => {
    // ?voice=browser forces browser speech (tests, no microphone, offline demos)
    const forceBrowser = new URLSearchParams(window.location.search).get("voice") === "browser";
    fetch("/api/voice/config").then((r) => r.json()).then((c) => setCfg({ elevenlabs: c.elevenlabs && !forceBrowser })).catch(() => setCfg({ elevenlabs: false }));
  }, []);
  if (!cfg) return null;
  if (cfg.elevenlabs)
    return (
      <ConversationProvider>
        <ElevenVoice>{children}</ElevenVoice>
      </ConversationProvider>
    );
  return <BrowserVoice>{children}</BrowserVoice>;
}

// ---------------------------------------------------------------------------

function useListeners() {
  const ls = useRef(new Set<(u: Utt) => void>());
  const emit = useCallback((u: Utt) => ls.current.forEach((f) => f(u)), []);
  const onUtterance = useCallback((cb: (u: Utt) => void) => {
    ls.current.add(cb);
    return () => {
      ls.current.delete(cb);
    };
  }, []);
  return { emit, onUtterance };
}

// ElevenLabs: the agent is the EARS (mic streaming, transcription, VAD, turn
// detection) and is permanently muted; the app is the MOUTH via streamed
// ElevenLabs TTS. What asky says is exactly what the app decided — no LLM in
// between that could improvise, repeat itself or fill silence.

const audioCache = new Map<string, HTMLAudioElement>();
function ttsAudio(text: string) {
  let a = audioCache.get(text);
  if (!a) {
    a = new Audio(`/api/voice/tts?text=${encodeURIComponent(text)}`);
    a.preload = "auto";
    audioCache.set(text, a);
    if (audioCache.size > 20) audioCache.delete(audioCache.keys().next().value!);
  }
  return a;
}

const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9äöüß ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
/** Is this transcript just our own voice coming back through the speakers? */
function isEcho(heard: string, said: string) {
  const h = words(heard);
  if (!h.length || !said) return false;
  const s = new Set(words(said));
  return h.filter((w) => s.has(w)).length / h.length > 0.6;
}

function ElevenVoice({ children }: { children: React.ReactNode }) {
  const { emit, onUtterance } = useListeners();
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const lastUser = useRef(0);
  const lastTranscript = useRef(0);
  const current = useRef<{ audio: HTMLAudioElement; text: string; endedAt: number; done: () => void } | null>(null);
  const lastSaid = useRef({ text: "", until: 0 });
  const wantLive = useRef<{ role: VoiceRole; ctx?: string } | null>(null);
  const convRef = useRef<ReturnType<typeof useConversation> | null>(null);

  const connect = useCallback(async () => {
    const want = wantLive.current;
    const c = convRef.current;
    if (!want || !c) return;
    const { signed_url } = await fetch("/api/voice/signed-url").then((x) => x.json());
    c.startSession({ signedUrl: signed_url });
    if (want.ctx) setTimeout(() => convRef.current?.sendContextualUpdate(`[ROLE] ${want.role}. ${want.ctx}`), 1500);
  }, []);

  const conv = useConversation({
    onConnect: () => convRef.current?.setVolume({ volume: 0 }),
    onModeChange: () => convRef.current?.setVolume({ volume: 0 }), // the agent never speaks out loud
    onDisconnect: () => {
      // sessions can drop (network, max duration): reconnect while we still want to listen
      if (wantLive.current) setTimeout(() => connect().catch(() => {}), 1000);
    },
    onMessage: (m) => {
      const r = (m as { role?: string }).role ?? m.source;
      if (r !== "user" || !m.message?.trim() || m.message.startsWith("[")) return;
      const text = m.message.trim();
      if (Date.now() < lastSaid.current.until && isEcho(text, lastSaid.current.text)) return; // our own TTS
      lastUser.current = Date.now();
      lastTranscript.current = Date.now();
      emit({ text, ts: Date.now() });
    },
    onVadScore: ({ vadScore }) => {
      // VAD also fires on background noise and on our own playback: count it as the
      // person speaking only while real words are being transcribed.
      const sp = vadScore > 0.55 && !current.current && Date.now() - lastTranscript.current < 6000;
      if (sp) lastUser.current = Date.now();
      setUserSpeaking((prev) => (prev === sp ? prev : sp));
    },
  });
  useEffect(() => {
    convRef.current = conv;
  });

  // keep the agent's silence timer from ever firing
  useEffect(() => {
    const t = setInterval(() => {
      const c = convRef.current;
      if (c?.status === "connected") c.sendUserActivity();
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const speak = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      current.current?.done();
      const audio = ttsAudio(text);
      audioCache.delete(text); // single use
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        audio.pause();
        current.current = null;
        lastSaid.current = { text, until: Date.now() + 1500 };
        setSpeaking(false);
        resolve();
      };
      current.current = { audio, text, endedAt: 0, done };
      lastSaid.current = { text, until: Number.MAX_SAFE_INTEGER };
      setSpeaking(true);
      audio.onended = done;
      audio.onerror = () => {
        // TTS failed → browser speech, so the question is still heard
        current.current = null;
        browserSpeak(text).then(done);
      };
      audio.play().catch(() => browserSpeak(text).then(done));
      setTimeout(done, 4000 + text.length * 90); // never hang
    });
  }, []);

  const voice = useMemo<Voice>(
    () => ({
      engine: "elevenlabs",
      status: conv.status === "connected" ? "live" : conv.status === "connecting" ? "connecting" : "idle",
      agentSpeaking: speaking,
      userSpeaking,
      get lastUserSpeechAt() {
        return lastUser.current;
      },
      async start(role, roleContext) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        wantLive.current = { role, ctx: roleContext };
        await connect();
        await speak(FIRST_MESSAGE[role]);
      },
      stop() {
        wantLive.current = null;
        current.current?.done();
        conv.endSession();
      },
      say: (text) => speak(text),
      prepare(text) {
        ttsAudio(text);
      },
      hush() {
        current.current?.done();
      },
      context(text) {
        if (conv.status === "connected") conv.sendContextualUpdate(`[SCREEN] ${text}`);
      },
      activity() {
        if (conv.status === "connected") conv.sendUserActivity();
      },
      typeAnswer(text) {
        lastUser.current = Date.now();
        emit({ text, ts: Date.now() });
      },
      onUtterance,
    }),
    [conv, userSpeaking, speaking, emit, onUtterance, connect, speak],
  );
  return <Ctx.Provider value={voice}>{children}</Ctx.Provider>;
}

/** Plain browser TTS, used as fallback when the ElevenLabs agent is not connected. */
function browserSpeak(text: string) {
  return new Promise<void>((resolve) => {
    if (typeof speechSynthesis === "undefined") return resolve();
    const u = new SpeechSynthesisUtterance(text);
    let done = false;
    const end = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    u.onend = end;
    u.onerror = end;
    setTimeout(end, 1500 + text.length * 65);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}

// ---------------------------------------------------------------------------

type SR = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function BrowserVoice({ children }: { children: React.ReactNode }) {
  const { emit, onUtterance } = useListeners();
  const [status, setStatus] = useState<Voice["status"]>("idle");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const lastUser = useRef(0);
  const rec = useRef<SR | null>(null);
  const restart = useRef<() => void>(() => {});
  const live = useRef(false);
  const muted = useRef(false); // don't transcribe our own TTS
  const hasSR = typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  const startRec = useCallback(() => {
    if (!hasSR || rec.current) return;
    const C = ((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as new () => SR;
    const r = new C();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (e) => {
      if (muted.current) return;
      for (let k = e.resultIndex; k < e.results.length; k++) {
        const res = e.results[k];
        lastUser.current = Date.now();
        setUserSpeaking(true);
        if (res.isFinal && res[0].transcript.trim()) {
          emit({ text: res[0].transcript.trim(), ts: Date.now() });
          setUserSpeaking(false);
        }
      }
    };
    r.onend = () => {
      rec.current = null;
      if (live.current) setTimeout(() => restart.current(), 200);
    };
    r.onerror = () => {};
    rec.current = r;
    try {
      r.start();
    } catch {}
  }, [emit, hasSR]);

  useEffect(() => {
    restart.current = startRec;
  }, [startRec]);

  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() - lastUser.current > 900) setUserSpeaking(false);
    }, 300);
    return () => clearInterval(t);
  }, []);

  const speak = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      if (typeof speechSynthesis === "undefined") return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.03;
      const v = speechSynthesis.getVoices().find((x) => /en-(US|GB)/.test(x.lang) && /female|samantha|google us english|zira|aria/i.test(x.name)) ?? speechSynthesis.getVoices().find((x) => x.lang.startsWith("en"));
      if (v) u.voice = v;
      muted.current = true;
      setAgentSpeaking(true);
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        setAgentSpeaking(false);
        setTimeout(() => (muted.current = false), 300);
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      // some browsers (and headless ones) never fire onend
      setTimeout(done, 1500 + text.length * 65);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    });
  }, []);

  const voice = useMemo<Voice>(
    () => ({
      engine: hasSR ? "browser" : "text",
      status,
      agentSpeaking,
      userSpeaking,
      get lastUserSpeechAt() {
        return lastUser.current;
      },
      async start(role) {
        live.current = true;
        setStatus("live");
        startRec();
        await speak(FIRST_MESSAGE[role]);
      },
      stop() {
        live.current = false;
        rec.current?.abort();
        rec.current = null;
        speechSynthesis?.cancel();
        setStatus("idle");
      },
      say: (text) => speak(text),
      prepare() {},
      hush() {
        if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
      },
      context() {},
      activity() {},
      typeAnswer(text) {
        lastUser.current = Date.now();
        emit({ text, ts: Date.now() });
      },
      onUtterance,
    }),
    [status, agentSpeaking, userSpeaking, startRec, speak, emit, onUtterance, hasSR],
  );
  return <Ctx.Provider value={voice}>{children}</Ctx.Provider>;
}
