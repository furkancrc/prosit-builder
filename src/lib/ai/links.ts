import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { htmlToText } from "./html-text";

export interface LinkContext {
  url: string;
  ok: boolean;
  title?: string;
  text?: string;
  /** Raison de l'échec (page privée, PDF, délai dépassé…). */
  error?: string;
}

const MAX_BYTES = 3_000_000;
const MAX_CHARS_PER_LINK = 20_000;
const TIMEOUT_MS = 12_000;
const TTL_MS = 10 * 60_000;

const g = globalThis as unknown as { __linkCache?: Map<string, { at: number; value: LinkContext }> };
const cache = (g.__linkCache ??= new Map());

/** Adresse interne (boucle locale, réseau privé, lien local) : refusée pour ne pas sonder le réseau du serveur. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("lien non http(s)");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) throw new Error("adresse locale refusée");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error("adresse privée refusée");
}

/** Télécharge une page (en suivant au plus 3 redirections vérifiées) et en garde le texte. */
export async function fetchLink(raw: string): Promise<LinkContext> {
  const hit = cache.get(raw);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await fetchUncached(raw);
  if (value.ok) cache.set(raw, { at: Date.now(), value });
  return value;
}

async function fetchUncached(raw: string): Promise<LinkContext> {
  try {
    let url = new URL(raw);
    let res: Response | undefined;
    for (let hop = 0; hop < 4; hop++) {
      await assertPublic(url);
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PrositBuilder/1.0)", Accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        url = new URL(loc, url);
        continue;
      }
      break;
    }
    if (!res) throw new Error("trop de redirections");
    if (res.status === 401 || res.status === 403) return { url: raw, ok: false, error: "page protégée (connexion requise)" };
    if (!res.ok) return { url: raw, ok: false, error: `erreur HTTP ${res.status}` };

    const type = res.headers.get("content-type") ?? "";
    if (/pdf/i.test(type)) return { url: raw, ok: false, error: "PDF non lu : colle le texte utile dans la discussion" };
    if (!/text\/|html|xml|json/i.test(type)) return { url: raw, ok: false, error: `type non pris en charge (${type.split(";")[0] || "inconnu"})` };

    const body = await readLimited(res);
    const { title, text } = /html|xml/i.test(type) ? htmlToText(body) : { title: "", text: body.trim() };
    if (text.length < 80) return { url: raw, ok: false, error: "page vide ou générée en JavaScript", title };
    // Une page Moodle / ENT renvoie souvent un formulaire de connexion avec un code 200.
    if (/\b(mot de passe|password)\b/i.test(text.slice(0, 3000)) && text.length < 4000) return { url: raw, ok: false, error: "page de connexion (lien privé)", title };
    return { url: raw, ok: true, title, text: text.length > MAX_CHARS_PER_LINK ? `${text.slice(0, MAX_CHARS_PER_LINK)}\n[…texte tronqué]` : text };
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError" ? "délai dépassé" : (e as Error).message || "inaccessible";
    return { url: raw, ok: false, error: msg };
  }
}

async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}
