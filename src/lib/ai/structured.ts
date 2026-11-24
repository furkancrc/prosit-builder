import { z } from "zod";
import { PointSchema, type ListItem } from "../schema";
import { cleanMultiline, cleanText, stripMarkdown } from "../format/text";
import { parsePlanText } from "../format/plan";
import { stripCitations } from "./insert";

/**
 * Génération structurée : Perplexity répond en JSON (response_format json_schema), validé par zod.
 * Si la réponse n'est pas un JSON valide, on retombe sur le parseur déterministe (jamais de 2e appel).
 * Ce module est pur (pas de réseau) : l'appel HTTP est dans perplexity.ts.
 */

export type GenKind = "definition" | "justification" | "plan";

/** Ce qu'une génération peut modifier sur un élément de liste. */
export type StructuredPatch = Partial<Pick<ListItem, "text" | "detail" | "status" | "description" | "points" | "etapes" | "interet">>;

/** Type de génération d'un champ de liste (null : pas de génération structurée). */
export function genKindFor(field: { plan?: boolean; status?: boolean; detail?: string }): GenKind | null {
  if (field.plan) return "plan";
  if (field.status) return "justification";
  if (field.detail) return "definition";
  return null;
}

// ---------- schémas (JSON Schema envoyé à Perplexity, zod pour valider) ----------

const str = (maxLength: number) => ({ type: "string", maxLength });

export const JSON_SCHEMAS: Record<GenKind, { name: string; schema: Record<string, unknown> }> = {
  definition: {
    name: "definition",
    schema: { type: "object", properties: { definition: str(1200) }, required: ["definition"], additionalProperties: false },
  },
  justification: {
    name: "justification_hypothese",
    schema: {
      type: "object",
      properties: { statut: { type: "string", enum: ["validée", "partielle", "non validée"] }, justification: str(1200) },
      required: ["justification"],
      additionalProperties: false,
    },
  },
  plan: {
    name: "element_plan",
    schema: {
      type: "object",
      properties: {
        titre: str(200),
        description: str(800),
        points: {
          type: "array",
          maxItems: 8,
          items: { type: "object", properties: { label: str(60), texte: str(400) }, required: ["texte"], additionalProperties: false },
        },
        etapes: { type: "array", maxItems: 10, items: str(400) },
        interet: str(400),
      },
      required: ["titre"],
      additionalProperties: false,
    },
  },
};

const DefinitionZ = z.object({ definition: z.string().min(1) });
const JustificationZ = z.object({ statut: z.enum(["validée", "partielle", "non validée"]).optional(), justification: z.string().min(1) });
const PlanZ = z.object({
  titre: z.string().min(1),
  description: z.string().optional(),
  points: z.array(PointSchema.extend({ label: z.string().optional().nullable().transform((v) => v ?? undefined) })).optional(),
  etapes: z.array(z.string()).optional(),
  interet: z.string().optional(),
});

// ---------- prompts ----------

const RULES = [
  "Réponds uniquement avec un objet JSON conforme au schéma demandé, rien avant ni après.",
  "En français, phrases courtes et précises, niveau étudiant ingénieur.",
  "Pas de Markdown (pas de **, #, -, `), pas de références [1], pas de retour à la ligne dans les valeurs.",
  "Les libellés (label) font 1 à 5 mots ; le texte qui suit ne répète pas le libellé.",
  "N'invente pas de faits : appuie-toi sur le document et les ressources fournies, complète par la recherche web si besoin.",
].join("\n");

export interface GenTarget {
  kind: GenKind;
  /** Rubrique et champ (« Plan d'action », « Études »…). */
  section: string;
  fieldLabel: string;
  text: string;
  detail?: string;
  /** Contenu structuré déjà présent (plan d'action), à compléter. */
  existing?: StructuredPatch;
}

export function structuredSystem(): string {
  return `Tu es l'assistant de rédaction d'un étudiant ingénieur du CESI qui rédige ses prosits (pédagogie PBL).\n${RULES}`;
}

export function structuredTask(t: GenTarget): string {
  const where = `rubrique « ${t.section} »${t.fieldLabel !== t.section ? `, partie « ${t.fieldLabel} »` : ""}`;
  const already = t.detail?.trim() ? `\nDéjà écrit (à compléter, sans le contredire) : « ${t.detail.trim()} »` : "";
  switch (t.kind) {
    case "definition":
      return `Rédige la définition ou l'explication de « ${t.text} » (${where}) : 2 à 4 phrases, sans répéter le terme en début de phrase.${already}\nSchéma : {"definition": string}`;
    case "justification":
      return `Pour l'hypothèse « ${t.text} » (${where}), indique si elle est validée, partielle ou non validée, et justifie en 1 à 3 phrases.${already}\nSchéma : {"statut": "validée"|"partielle"|"non validée", "justification": string}`;
    case "plan": {
      const ex = t.existing ? JSON.stringify(t.existing) : "";
      return [
        `Développe l'élément du plan d'action « ${t.text} » (${where}).`,
        "titre : reprend l'élément en une ligne (verbe à l'infinitif).",
        "description : 1 à 2 phrases.",
        "points : notions clés, chacune avec un label court (1 à 5 mots) et un texte d'une phrase.",
        "etapes : actions concrètes dans l'ordre (une phrase chacune), surtout pour une réalisation.",
        "interet : une phrase sur ce que ça apporte.",
        "Omets les parties qui n'ont pas de sens pour cet élément.",
        ex ? `Contenu déjà présent (à garder et compléter) : ${ex}` : "",
        'Schéma : {"titre": string, "description"?: string, "points"?: [{"label"?: string, "texte": string}], "etapes"?: string[], "interet"?: string}',
      ]
        .filter(Boolean)
        .join("\n");
    }
  }
}

// ---------- lecture de la réponse ----------

/** Retire le raisonnement <think>…</think> (modèles « reasoning ») et un éventuel bloc ```json. */
export function stripThink(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*<\/think>/i, "")
    .trim();
}

function extractJson(raw: string): unknown {
  const s = stripThink(raw)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(s.slice(a, b + 1));
      } catch {}
    }
    return undefined;
  }
}

const one = (s: string | undefined) => (s ? cleanText(stripCitations(s).replace(/\s*\n\s*/g, " ")) : "");
const STATUT = { validée: "valid", partielle: "partial", "non validée": "invalid" } as const;

export interface StructuredResult {
  patch: StructuredPatch;
  /** Réponse non conforme : mise en forme par le parseur déterministe. */
  warning?: string;
}

const FALLBACK_WARNING = "Réponse de l'IA non structurée : mise en forme automatique appliquée, vérifie le résultat.";

/** Réponse brute de Perplexity → modification de l'élément, validée et nettoyée. */
export function parseStructured(kind: GenKind, raw: string): StructuredResult {
  const json = extractJson(raw);
  if (kind === "plan") {
    const r = PlanZ.safeParse(json);
    if (r.success) {
      const d = r.data;
      const points = (d.points ?? []).map((p) => ({ ...(p.label && one(p.label) ? { label: one(p.label) } : {}), texte: one(p.texte) })).filter((p) => p.texte);
      const etapes = (d.etapes ?? []).map((e) => one(e).replace(/^\d+\s*[.)]\s*/, "")).filter(Boolean);
      return {
        patch: {
          text: one(d.titre),
          description: one(d.description),
          points,
          etapes,
          interet: one(d.interet?.replace(/^\s*(?:intérêt|avantage)\s*:\s*/i, "")),
        },
      };
    }
    const p = parsePlanText(stripCitations(stripThink(raw)));
    return {
      patch: { text: p.titre, description: p.description ?? "", points: p.points ?? [], etapes: p.etapes ?? [], interet: p.interet ?? "" },
      warning: FALLBACK_WARNING,
    };
  }
  if (kind === "justification") {
    const r = JustificationZ.safeParse(json);
    if (r.success) return { patch: { detail: one(r.data.justification), ...(r.data.statut ? { status: STATUT[r.data.statut] } : {}) } };
  } else {
    const r = DefinitionZ.safeParse(json);
    if (r.success) return { patch: { detail: one(r.data.definition) } };
  }
  // repli : texte libre nettoyé (une phrase par ligne au plus, sans Markdown ni citations)
  const text = cleanMultiline(stripMarkdown(stripCitations(stripThink(raw))));
  return { patch: { detail: text }, warning: FALLBACK_WARNING };
}

/** Texte lisible affiché dans la discussion (le Markdown léger y est rendu). */
export function patchToMarkdown(p: StructuredResult["patch"]): string {
  const out: string[] = [];
  if (p.description || p.points?.length || p.etapes?.length || p.interet) {
    if (p.text) out.push(`**${p.text}**`);
    if (p.description) out.push(p.description);
    for (const pt of p.points ?? []) out.push(`- ${pt.label ? `**${pt.label}** : ` : ""}${pt.texte}`);
    (p.etapes ?? []).forEach((e, i) => out.push(`${i + 1}. ${e}`));
    if (p.interet) out.push(`**Intérêt :** ${p.interet}`);
  } else {
    if (p.status) out.push(`**Statut :** ${p.status === "valid" ? "validée" : p.status === "partial" ? "partielle" : "non validée"}`);
    if (p.detail) out.push(p.detail);
  }
  return out.join("\n\n");
}

