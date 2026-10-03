import { dispatch, openapi } from "@/lib/ap/api";

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const sub = "/" + path.join("/");
  if (req.method === "GET" && sub === "/openapi.json") return Response.json(openapi());
  let body: unknown = undefined;
  if (req.method !== "GET") {
    const text = await req.text();
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
  }
  const res = dispatch(req.method, sub, body, new URL(req.url).searchParams);
  return Response.json(res.json, { status: res.status ?? 200 });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
