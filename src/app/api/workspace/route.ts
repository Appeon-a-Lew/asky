import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/store";
import { createVisitorWorkspace, LIMITS, TTL_MS } from "@/lib/visitors";
import { isGated, MAIN, runInWorkspace, WS_HEADER, WS_ID } from "@/lib/workspace";
import { signWorkspace, WS_COOKIE } from "@/lib/wscookie";

// Public: how people get a workspace. Not wrapped in withWorkspace — this is
// where the workspace cookie is made.
//   POST { code }        audience: the event code → a new private workspace
//   POST { presenter }   presenter password → the "main" workspace
//   GET                  who am I (workspace, expiry, budget)
//   DELETE               leave (drop the cookie)

const PRESENTER_TTL = 12 * 3600_000;
const attempts = new Map<string, number[]>();

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export async function POST(req: Request) {
  const secret = process.env.ASKY_SECRET;
  if (!isGated() || !secret) return Response.json({ ok: true, redirect: "/home", note: "open mode: no workspaces" });
  // slow down guessing: 10 tries per 10 minutes per address
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 600_000);
  if (recent.length >= 10) return Response.json({ error: "Too many tries — wait a few minutes" }, { status: 429 });
  attempts.set(ip, [...recent, now]);

  const b = (await req.json().catch(() => ({}))) as { code?: string; presenter?: string };
  let ws: string;
  let expiresAt: number;
  if (b.presenter !== undefined) {
    const pw = process.env.ASKY_PRESENTER_PASSWORD;
    if (!pw || !same(b.presenter, pw)) return Response.json({ error: "Wrong presenter password" }, { status: 403 });
    ws = MAIN;
    expiresAt = now + PRESENTER_TTL;
  } else {
    const code = process.env.ASKY_EVENT_CODE;
    if (!code) return Response.json({ error: "The audience demo is closed right now" }, { status: 403 });
    if (!same((b.code ?? "").trim().toLowerCase(), code.trim().toLowerCase())) return Response.json({ error: "That code doesn't match — check the slide" }, { status: 403 });
    try {
      ({ id: ws, expiresAt } = createVisitorWorkspace());
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 503 });
    }
  }
  (await cookies()).set(WS_COOKIE, await signWorkspace(ws, expiresAt, secret), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: Math.floor((expiresAt - now) / 1000),
  });
  return Response.json({ ok: true, workspace: ws === MAIN ? "main" : "visitor", redirect: ws === MAIN ? "/home" : "/start" });
}

export async function GET(req: Request) {
  if (!isGated()) return Response.json({ workspace: "main", visitor: false });
  const ws = req.headers.get(WS_HEADER); // set by the proxy from a verified cookie only
  if (!ws || !WS_ID.test(ws)) return Response.json({ workspace: null });
  if (ws === MAIN) return Response.json({ workspace: "main", visitor: false });
  try {
    const d = runInWorkspace(ws, () => db());
    return Response.json({ workspace: "visitor", visitor: true, expiresAt: d.workspace?.expiresAt, usage: d.usage, limits: LIMITS, ttlHours: TTL_MS / 3600_000 });
  } catch {
    return Response.json({ workspace: null, expired: true });
  }
}

export async function DELETE() {
  (await cookies()).delete(WS_COOKIE);
  return Response.json({ ok: true });
}
