// Minimal Frappe/ERPNext REST client. Logs in with a user + password (the
// sandbox defaults) and keeps the session cookie; set ERPNEXT_API_KEY /
// ERPNEXT_API_SECRET to use token auth instead.

export const ERPNEXT_URL = (process.env.ERPNEXT_URL || "http://localhost:8080").replace(/\/$/, "");
/** where the browser reaches ERPNext — differs from ERPNEXT_URL when asky runs next to it in Docker */
export const ERPNEXT_PUBLIC_URL = (process.env.ERPNEXT_PUBLIC_URL || ERPNEXT_URL).replace(/\/$/, "");
const USER = process.env.ERPNEXT_USER || "Administrator";
const PASSWORD = process.env.ERPNEXT_PASSWORD || "admin";

const g = globalThis as unknown as { __erpCookie?: string; __erpLogin?: Promise<void> };

function authHeaders(): Record<string, string> {
  if (process.env.ERPNEXT_API_KEY && process.env.ERPNEXT_API_SECRET) return { authorization: `token ${process.env.ERPNEXT_API_KEY}:${process.env.ERPNEXT_API_SECRET}` };
  return g.__erpCookie ? { cookie: g.__erpCookie } : {};
}

/** One login at a time: Frappe fails parallel logins of the same user. */
function login() {
  g.__erpLogin ??= doLogin().finally(() => (g.__erpLogin = undefined));
  return g.__erpLogin;
}

async function doLogin() {
  const r = await fetch(`${ERPNEXT_URL}/api/method/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usr: USER, pwd: PASSWORD }),
  });
  if (!r.ok) throw new Error(`ERPNext login failed: HTTP ${r.status}`);
  g.__erpCookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

export async function erp<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  if (!process.env.ERPNEXT_API_KEY && !g.__erpCookie) await login();
  const call = () =>
    fetch(`${ERPNEXT_URL}${path}`, {
      method,
      headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...authHeaders() },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  let r = await call();
  if ((r.status === 401 || r.status === 403) && !process.env.ERPNEXT_API_KEY) {
    await login();
    r = await call();
  }
  const text = await r.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {}
  if (!r.ok) {
    const msg = (json._server_messages as string | undefined) ?? (json.exception as string | undefined) ?? text.slice(0, 300);
    throw new Error(`ERPNext ${method} ${path}: HTTP ${r.status} ${msg}`);
  }
  return ((json.data ?? json.message) as T) ?? (json as T);
}

const enc = encodeURIComponent;

export const erpDoc = {
  get: <T = Record<string, unknown>>(doctype: string, name: string) => erp<T>("GET", `/api/resource/${enc(doctype)}/${enc(name)}`),
  list: <T = Record<string, unknown>>(doctype: string, opts: { fields?: string[]; filters?: unknown[]; limit?: number; order_by?: string } = {}) => {
    const q = new URLSearchParams({ fields: JSON.stringify(opts.fields ?? ["name"]), limit_page_length: String(opts.limit ?? 500) });
    if (opts.filters) q.set("filters", JSON.stringify(opts.filters));
    if (opts.order_by) q.set("order_by", opts.order_by);
    return erp<T[]>("GET", `/api/resource/${enc(doctype)}?${q}`);
  },
  insert: <T = Record<string, unknown>>(doctype: string, doc: Record<string, unknown>) => erp<T>("POST", `/api/resource/${enc(doctype)}`, doc),
  update: <T = Record<string, unknown>>(doctype: string, name: string, doc: Record<string, unknown>) => erp<T>("PUT", `/api/resource/${enc(doctype)}/${enc(name)}`, doc),
  remove: (doctype: string, name: string) => erp("DELETE", `/api/resource/${enc(doctype)}/${enc(name)}`),
  exists: async (doctype: string, name: string) => {
    try {
      await erpDoc.get(doctype, name);
      return true;
    } catch (e) {
      if (/HTTP 404/.test((e as Error).message)) return false;
      throw e;
    }
  },
  call: <T = unknown>(method: string, args: Record<string, unknown> = {}) => erp<T>("POST", `/api/method/${method}`, args),
};
