import type { Content, DocType, FieldValue, ListItem } from "./schema";

/**
 * Style de liste :
 * - bullet : puces à tous les niveaux (« - », « o », « ▪ »)
 * - numbered : 1. / a. / i.
 * - bullet-numbered : puces au niveau 0, sous-éléments numérotés (Réalisation)
 */
export type ListStyle = "bullet" | "numbered" | "bullet-numbered";

export type FieldDef =
  | { key: string; label: string; kind: "text"; heading: boolean; aliases?: string[]; placeholder?: string }
  | { key: string; label: string; kind: "list"; heading: boolean; style: ListStyle; aliases?: string[]; placeholder?: string };

export interface SectionDef {
  title: string;
  aliases?: string[];
  fields: FieldDef[];
}

export interface TemplateDef {
  type: DocType;
  label: string;
  sections: SectionDef[];
}

/** Structure reprise de « Prosit aller SI - 1.docx ». */
export const ALLER_TEMPLATE: TemplateDef = {
  type: "aller",
  label: "Prosit aller",
  sections: [
    {
      title: "Prendre connaissance de la situation et clarifier",
      fields: [
        { key: "motsInconnus", label: "Mots inconnus", kind: "list", heading: true, style: "bullet", placeholder: "Nouveau mot" },
        { key: "contexte", label: "Contexte", kind: "text", heading: true, placeholder: "Résumé de la situation…" },
      ],
    },
    {
      title: "Analyser le besoin",
      fields: [
        { key: "probleme", label: "Problème", kind: "text", heading: true, aliases: ["problematique"], placeholder: "Comment… ?" },
        { key: "contraintes", label: "Contraintes", kind: "list", heading: true, style: "bullet", placeholder: "Nouvelle contrainte" },
        { key: "livrables", label: "Livrables", kind: "list", heading: true, style: "numbered", placeholder: "Nouveau livrable" },
      ],
    },
    {
      title: "Généralisation",
      fields: [{ key: "generalisation", label: "Généralisation", kind: "list", heading: false, style: "bullet" }],
    },
    {
      title: "Recherche des pistes de solution",
      aliases: ["pistes de solution", "hypotheses"],
      fields: [{ key: "pistes", label: "Pistes de solution", kind: "list", heading: false, style: "bullet", placeholder: "Nouvelle hypothèse" }],
    },
    {
      title: "Plan d’action",
      aliases: ["plan d'action", "plan daction"],
      fields: [
        { key: "etude", label: "Étude", kind: "list", heading: true, style: "numbered", placeholder: "Notion à étudier" },
        { key: "realisation", label: "Réalisation", kind: "list", heading: true, style: "bullet-numbered", placeholder: "Action à réaliser" },
      ],
    },
  ],
};

/**
 * Prosit retour : rubriques encore à définir avec l'utilisateur.
 * En attendant, un seul champ libre (aucune rubrique inventée).
 */
export const RETOUR_TEMPLATE: TemplateDef = {
  type: "retour",
  label: "Prosit retour",
  sections: [
    {
      title: "Contenu",
      fields: [{ key: "contenu", label: "Contenu", kind: "text", heading: false, placeholder: "Rubriques du prosit retour à définir…" }],
    },
  ],
};

export function getTemplate(type: DocType): TemplateDef {
  return type === "aller" ? ALLER_TEMPLATE : RETOUR_TEMPLATE;
}

export function allFields(t: TemplateDef): FieldDef[] {
  return t.sections.flatMap((s) => s.fields);
}

export function emptyContent(t: TemplateDef): Content {
  const c: Content = {};
  for (const f of allFields(t)) c[f.key] = f.kind === "text" ? "" : [];
  return c;
}

/** Ne garde que les champs du template, avec le bon type (les autres sont ignorés). */
export function coerceContent(t: TemplateDef, raw: Content | undefined): Content {
  const out = emptyContent(t);
  if (!raw) return out;
  for (const f of allFields(t)) {
    const v: FieldValue | undefined = raw[f.key];
    if (f.kind === "text" && typeof v === "string") out[f.key] = v;
    if (f.kind === "list" && Array.isArray(v)) out[f.key] = v as ListItem[];
  }
  return out;
}
