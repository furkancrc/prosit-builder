import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, jsonError } from "@/lib/api";
import { DocTypeSchema, PointSchema } from "@/lib/schema";
import { prositContext } from "@/lib/ai/context";
import { assistantConfig, completeJson, PerplexityError } from "@/lib/ai/perplexity";
import { JSON_SCHEMAS, parseStructured, structuredSystem, structuredTask } from "@/lib/ai/structured";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.object({
  prositId: z.string().min(1).max(64),
  type: DocTypeSchema,
  kind: z.enum(["definition", "justification", "plan"]),
  section: z.string().max(200),
  fieldLabel: z.string().max(200),
  text: z.string().min(1).max(2000),
  detail: z.string().max(5000).optional(),
  existing: z
    .object({
      description: z.string().max(5000).optional(),
      points: z.array(PointSchema).max(60).optional(),
      etapes: z.array(z.string().max(2000)).max(60).optional(),
      interet: z.string().max(2000).optional(),
    })
    .optional(),
});

/**
 * Génération structurée d'un élément (définition, justification d'hypothèse, élément du plan d'action).
 * Un seul appel à Perplexity en JSON imposé ; si la réponse n'est pas conforme, le parseur déterministe
 * prend le relais et la réponse porte un avertissement. Renvoie { patch, warning?, sources }.
 */
export function POST(req: Request) {
  return handle(async () => {
    if (!assistantConfig().enabled) return jsonError(503, "Assistant désactivé : ajoute PERPLEXITY_API_KEY dans .env puis redémarre le serveur.");
    const body = BodySchema.parse(await req.json());
    const ctx = await prositContext(body.prositId, body.type, body.section);
    if (!ctx) return jsonError(404, "Prosit introuvable");

    const { name, schema } = JSON_SCHEMAS[body.kind];
    try {
      const { content, sources } = await completeJson({
        system: structuredSystem(),
        user: `${ctx.context}\n\n---\n${structuredTask(body)}`,
        schemaName: name,
        schema,
        signal: req.signal,
      });
      const { patch, warning } = parseStructured(body.kind, content);
      return NextResponse.json({ patch, warning, sources });
    } catch (e) {
      if (e instanceof PerplexityError) return jsonError(502, e.message);
      throw e;
    }
  });
}
