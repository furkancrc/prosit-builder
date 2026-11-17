/**
 * Cookie de session signé (HMAC-SHA256) — compatible Edge (middleware) et Node.
 * Format : `<expiration en ms>.<signature base64url>`
 */
export const SESSION_COOKIE = "pb_session";
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function secret(): string {
  return process.env.SESSION_SECRET || `${process.env.APP_PASSWORD ?? ""}::prosit-builder-dev-secret`;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const exp = String(now + SESSION_TTL_MS);
  return `${exp}.${await sign(exp)}`;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  return safeEqual(sig, await sign(exp));
}

export function authEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}
