// Signed workspace cookie: "<workspace>.<expires-ms>.<hmac>". Web Crypto only, so
// the proxy and the route handlers share it. Signing is the whole point: without
// it anyone could set "main" and edit the presenter's knowledge.

export const WS_COOKIE = "asky_ws";

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signWorkspace(ws: string, expiresAt: number, secret: string) {
  const body = `${ws}.${expiresAt}`;
  return `${body}.${await hmac(secret, body)}`;
}

/** The workspace id, or null when missing, forged or expired. */
export async function verifyWorkspace(value: string | undefined, secret: string): Promise<string | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [ws, exp, sig] = parts;
  if (!/^(main|v-[a-z0-9]{16})$/.test(ws) || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  const want = await hmac(secret, `${ws}.${exp}`);
  // constant-time compare
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let k = 0; k < want.length; k++) diff |= want.charCodeAt(k) ^ sig.charCodeAt(k);
  return diff === 0 ? ws : null;
}
