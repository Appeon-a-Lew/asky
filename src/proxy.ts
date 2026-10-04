import { type NextRequest, NextResponse } from "next/server";
import { verifyWorkspace, WS_COOKIE } from "@/lib/wscookie";

// Every request: verify the signed workspace cookie and pass the workspace on
// as a header the app trusts (any copy sent by a client is dropped). Without a
// workspace only the landing page, the presenter login and the entry endpoint
// are reachable. Without ASKY_SECRET (local development) nothing is gated.

const WS_HEADER = "x-asky-ws";
const PUBLIC = [/^\/$/, /^\/presenter$/, /^\/api\/workspace$/];

export async function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.delete(WS_HEADER);
  const secret = process.env.ASKY_SECRET;
  if (!secret) return NextResponse.next({ request: { headers } });

  const ws = await verifyWorkspace(req.cookies.get(WS_COOKIE)?.value, secret);
  if (ws) {
    headers.set(WS_HEADER, ws);
    return NextResponse.next({ request: { headers } });
  }
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next({ request: { headers } });
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "No workspace — start at the home page" }, { status: 401 });
  return NextResponse.redirect(new URL("/?expired=1", req.url));
}

export const config = {
  // public: Next's static files and the landing page's assets. Everything else — API routes
  // included, even when they end in .jpg (screen moments) — goes through the workspace check.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|landing/|demo/).*)"],
};
