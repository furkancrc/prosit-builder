import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const PUBLIC = [/^\/login$/, /^\/api\/login$/, /^\/api\/health$/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();

  if (!process.env.APP_PASSWORD) {
    // Sans mot de passe : ouvert en développement, bloqué en production.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return deny(req, "config");
  }
  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  return deny(req);
}

function deny(req: NextRequest, reason?: string) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (reason) url.searchParams.set("erreur", reason);
  else if (req.nextUrl.pathname !== "/") url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  runtime: "nodejs",
  // Les routes d'envoi de fichiers sont exclues : quand le middleware s'applique, Next.js duplique le corps
  // de la requête et la route trouve parfois le flux déjà verrouillé (erreur 500 intermittente sur les images).
  // Elles vérifient la session elles-mêmes (isAuthorized).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|api/assets|api/import).*)"],
};
