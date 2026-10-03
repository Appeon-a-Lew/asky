"use client";

import type { Question } from "./types";

export async function j<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body !== undefined ? { "content-type": "application/json" } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((json as { error?: string }).error || `HTTP ${r.status}`);
  return json as T;
}

export const api = {
  createSession: (mode: string, personId: string, extra: Record<string, unknown> = {}) => j<{ id: string; title: string }>("POST", "/api/sessions", { mode, personId, ...extra }),
  events: (sid: string, msgs: unknown[]) => j<{ events: { id: string; summary: string; kind: string; tool?: string; caseId?: string; effect?: string; ts: number }[]; questions: Question[]; recognized?: Recognized[] }>("POST", `/api/sessions/${sid}/events`, { msgs }),
  gate: (sid: string, body: { method: string; path: string; body?: unknown }) => j<GateResponse>("POST", `/api/sessions/${sid}/gate`, body),
  utter: (sid: string, u: { speaker: string; text: string; questionId?: string; ts?: number }) => j("POST", `/api/sessions/${sid}/utterances`, u),
  question: (sid: string, qid: string, patch: Partial<Question>) => j<Question>("PATCH", `/api/sessions/${sid}/questions/${qid}`, patch),
  offRecord: (sid: string, on: boolean) => j("POST", `/api/sessions/${sid}/off-record`, { on }),
  debrief: (sid: string) => j<{ questions: Question[] }>("POST", `/api/sessions/${sid}/debrief`),
  teachBack: (sid: string) => j<{ text: string; situations: number; by: string }>("POST", `/api/sessions/${sid}/teachback`, {}),
  confirm: (sid: string, confirmed: boolean, corrections?: string) =>
    j<{ committed?: { changed: { pageId: string; title: string; created: boolean; added: string[] }[]; lessons: string[] }; again?: { text: string } }>("POST", `/api/sessions/${sid}/teachback`, { confirmed, corrections }),
};

export interface Recognized {
  eventId: string;
  summary: string;
  pageId: string;
  title: string;
  status: string;
}

export interface GateResponse {
  allow: boolean;
  tool?: string;
  effect?: string;
  hold?: { question: Question };
  violations?: { pageId: string; pageTitle: string; reason: string; quote?: string; expert?: string; frameId?: string; guardrail: { id: string; text: string; kind: string; contact?: string } }[];
  message?: string;
}

export const frameUrl = (sessionId: string | undefined, frames: { id: string; file: string }[] | undefined, frameId?: string) => {
  const f = frames?.find((x) => x.id === frameId);
  return f ? `/api/frames/${f.file}` : null;
};
