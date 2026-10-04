import "server-only";
import { currentWorkspace, isVisitor } from "./workspace";

// Live ElevenLabs conversations are limited by the plan's concurrency. The
// presenter always gets one; the audience shares a few seats, held for 15
// minutes after each start. Without a seat the app uses the browser's voice.

const SEATS = Number(process.env.ASKY_VISITOR_VOICE_SEATS || 4);
const HOLD_MS = 15 * 60_000;
const g = globalThis as unknown as { __askySeats?: Map<string, number> };
const seats = (g.__askySeats ??= new Map());

function prune(now: number) {
  for (const [ws, at] of seats) if (now - at > HOLD_MS) seats.delete(ws);
}

export function voiceSeatFree(): boolean {
  if (!isVisitor()) return true;
  prune(Date.now());
  return seats.has(currentWorkspace()) || seats.size < SEATS;
}

export function takeVoiceSeat(): boolean {
  if (!isVisitor()) return true;
  if (!voiceSeatFree()) return false;
  seats.set(currentWorkspace(), Date.now());
  return true;
}
