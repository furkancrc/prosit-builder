import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, jsonError } from "@/lib/api";
import { getDocuments, getProsit } from "@/lib/db";
import { effectiveMeta } from "@/lib/meta";
import { DocTypeSchema, type Meta } from "@/lib/schema";
import { docToText } from "@/lib/ai/doc-text";
import { fetchLink } from "@/lib/ai/links";
import { assistantConfig, PerplexityError, streamAgent } from "@/lib/ai/perplexity";
import { buildContext, buildInstructions } from "@/lib/ai/prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export function GET() {
  return NextResponse.json(assistantConfig());
}

const BodySchema = z.object({
  prositId: z.string().min(1).max(64),
  type: DocTypeSchema,
  /** Rubrique en cours, donnée comme indice à l'assistant. */
  focus: z.string().max(200).optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(20000) }))
    .min(1)
    .max(40)
    .refine((m) => m[m.length - 1].role === "user", "Le dernier message doit venir de l'utilisateur"),
});

const META_KEYS: (keyof Meta)[] = ["nom", "theme", "numero", "bloc", "date", "auteur", "groupe", "lien"];

/**
 * Pose une question à l'assistant. Le serveur relit le prosit enregistré (aller + retour) et les liens d'aide,
 * puis renvoie la réponse en NDJSON : {t:"links"}, {t:"delta"}…, {t:"sources"}, {t:"done"} ou {t:"error"}.
 */
export function POST(req: Request) {
  return handle(async () => {
    const cfg = assistantConfig();
    if (!cfg.enabled) return jsonError(503, "Assistant désactivé : ajoute PERPLEXITY_API_KEY dans .env puis redémarre le serveur.");
    const body = BodySchema.parse(await req.json());
    const prosit = getProsit(body.prositId);
    if (!prosit) return jsonError(404, "Prosit introuvable");

    const docs = getDocuments(prosit.id);
    const base = Object.fromEntries(META_KEYS.map((k) => [k, prosit[k] ?? ""])) as Meta;
    const textOf = (type: "aller" | "retour") => {
      const d = docs.find((x) => x.type === type);
      return d ? docToText(effectiveMeta(base, type, type === "retour" ? d.metaOverrides : null), type, d.content) : "";
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
        try {
          const links = await Promise.all(prosit.liensAide.map(fetchLink));
          send({ t: "links", links: links.map((l) => ({ url: l.url, ok: l.ok, title: l.title, error: l.error })) });

          const context = buildContext({
            type: body.type,
            docText: textOf(body.type),
            allerText: body.type === "retour" ? textOf("aller") : undefined,
            focus: body.focus,
            links,
          });
          // Le contexte (document + ressources) est rattaché à la dernière question : il reflète toujours l'état actuel.
          const messages = body.messages.map((m, i) =>
            i === body.messages.length - 1 ? { role: m.role, content: `${context}\n\n---\nDemande de l'étudiant :\n${m.content}` } : m,
          );
          for await (const ev of streamAgent({ instructions: buildInstructions(), input: messages, signal: req.signal })) {
            if (ev.type === "text") send({ t: "delta", text: ev.text });
            else send({ t: "sources", sources: ev.sources });
          }
          send({ t: "done" });
        } catch (e) {
          if (!req.signal.aborted) {
            if (!(e instanceof PerplexityError)) console.error(e);
            send({ t: "error", error: e instanceof PerplexityError ? e.message : "Erreur pendant l'appel à Perplexity." });
          }
        } finally {
          try {
            controller.close();
          } catch {}
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  });
}
