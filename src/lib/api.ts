import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json({ error, details }, { status });
}

/** Exécute un handler et convertit les erreurs zod / JSON en réponses 400. */
export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ZodError) {
      // message lisible : premier problème avec son emplacement (ex. « content › pistes › 3 › text : trop long »)
      const first = e.issues[0];
      const where = first?.path.length ? `${first.path.join(" › ")} : ` : "";
      return jsonError(400, `Données refusées (${where}${first?.message ?? "invalide"})`, e.flatten());
    }
    if (e instanceof SyntaxError) return jsonError(400, "JSON invalide");
    console.error(e);
    return jsonError(500, "Erreur interne");
  }
}
