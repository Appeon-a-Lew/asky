import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

// Which workspace a request works in. "main" is the presenter's (and local
// development's) data; every audience member gets a private "v-…" workspace.
// The proxy (src/proxy.ts) verifies the signed cookie and sets WS_HEADER —
// overwriting anything a client sent — and route handlers enter that
// workspace for everything they call. Fail-closed: inside a gated server, a
// request without a workspace never falls back to "main".

export const MAIN = "main";
export const WS_HEADER = "x-asky-ws";
export const WS_ID = /^(main|v-[a-z0-9]{16})$/;

const als = new AsyncLocalStorage<string>();

/** Gated = ASKY_SECRET is set (the public server). Without it everything is "main", as before. */
export const isGated = () => !!process.env.ASKY_SECRET;

export function currentWorkspace(): string {
  const ws = als.getStore();
  if (ws) return ws;
  // local development, and scripts (seed, harness, simulate) outside the Next server
  if (!isGated() || !process.env.NEXT_RUNTIME) return MAIN;
  throw new Error("No workspace for this request");
}

export const isVisitor = () => currentWorkspace() !== MAIN;

export function workspaceFromHeaders(h: Headers): string {
  const ws = h.get(WS_HEADER);
  if (!isGated()) return MAIN;
  if (!ws || !WS_ID.test(ws)) throw new Error("No workspace for this request");
  return ws;
}

/** Run `fn` (and everything it awaits or schedules) inside a workspace. */
export function runInWorkspace<T>(ws: string, fn: () => T): T {
  if (!WS_ID.test(ws)) throw new Error("bad workspace id");
  return als.run(ws, fn);
}

/** For server components: enter the workspace for the rest of this render's async chain. */
export function enterWorkspace(ws: string) {
  if (!WS_ID.test(ws)) throw new Error("bad workspace id");
  als.enterWith(ws);
}

/** Wrap a route handler: it runs in the request's workspace. */
export function withWorkspace<C, R extends Response | Promise<Response>>(handler: (req: Request, ctx: C) => R) {
  return (req: Request, ctx: C): R | Response => {
    let ws: string;
    try {
      ws = workspaceFromHeaders(req.headers);
    } catch {
      return Response.json({ error: "No workspace — start at the home page" }, { status: 401 });
    }
    return runInWorkspace(ws, () => handler(req, ctx));
  };
}
