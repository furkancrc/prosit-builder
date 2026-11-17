import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { handle, jsonError } from "@/lib/api";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/session";

const Body = z.object({ password: z.string().max(500) });
const h = (s: string) => createHash("sha256").update(s).digest();

let failures = 0;
let lastFailure = 0;

export function POST(req: Request) {
  return handle(async () => {
    const expected = process.env.APP_PASSWORD;
    if (!expected) return jsonError(503, "APP_PASSWORD n'est pas configuré sur le serveur.");
    // Ralentit le brute-force : délai croissant après des échecs récents.
    if (Date.now() - lastFailure > 15 * 60_000) failures = 0;
    await new Promise((r) => setTimeout(r, Math.min(failures, 10) * 300));

    const { password } = Body.parse(await req.json());
    if (!timingSafeEqual(h(password), h(expected))) {
      failures++;
      lastFailure = Date.now();
      return jsonError(401, "Mot de passe incorrect.");
    }
    failures = 0;
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    return res;
  });
}
