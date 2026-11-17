import type { Content, DocType, FieldValue, ListItem } from "./schema";

/**
 * Style de liste :
 * - bullet : puces « ■ » à tous les niveaux
 * - numbered : 1. / a. / i.
 * - bullet-numbered : puces au niveau 0, sous-éléments numérotés (Réalisation)
 */
export type ListStyle = "bullet" | "numbered" | "bullet-numbered";

interface FieldBase {
  key: string;
  label: string;
  /** Sous-titre affiché dans le document (ex. « Études : » dans le plan d'action). */
  heading: boolean;
  aliases?: string[];
  placeholder?: string;
}

export type FieldDef =
  | (FieldBase & { kind: "text" })
  | (FieldBase & { kind: "list"; style: ListStyle })
  /** Champ court affiché « Libellé : valeur » en gras (section Rôles). */
  | (FieldBase & { kind: "role" });

export interface SectionDef {
  title: string;
  /** Section sans numéro romain (ex. Rôles). */
  unnumbered?: boolean;
  aliases?: string[];
  fields: FieldDef[];
}

export interface TemplateDef {
  type: DocType;
  label: string;
  sections: SectionDef[];
}

/** Structure et intitulés repris du modèle « Prosit_Aller_Stats_OS.docx ». */
export const ALLER_TEMPLATE: TemplateDef = {
  type: "aller",
  label: "Prosit aller",
  sections: [
    {
      title: "Rôles",
      unnumbered: true,
      fields: [
        { key: "roleAnimateur", label: "Animateur", kind: "role", heading: false, placeholder: "Prénom" },
        { key: "roleSecretaire", label: "Secrétaire", kind: "role", heading: false, placeholder: "Prénom" },
        { key: "roleScribe", label: "Scribe", kind: "role", heading: false, placeholder: "Prénom" },
        { key: "roleGestionnaire", label: "Gestionnaire du temps", kind: "role", heading: false, aliases: ["gestionnaire"], placeholder: "Prénom" },
      ],
    },
    {
      title: "Mots clés",
      aliases: ["mots clees", "mots-clés", "mots inconnus", "mots cles"],
      fields: [{ key: "motsInconnus", label: "Mots clés", kind: "list", heading: false, style: "bullet", placeholder: "Nouveau mot" }],
    },
    {
      title: "Contexte",
      fields: [{ key: "contexte", label: "Contexte", kind: "text", heading: false, placeholder: "Résumé de la situation…" }],
    },
    {
      title: "Problématique",
      aliases: ["probleme", "problematiques"],
      fields: [{ key: "probleme", label: "Problématique", kind: "text", heading: false, placeholder: "Comment… ?" }],
    },
    {
      title: "Contraintes",
      aliases: ["contrainte"],
      fields: [{ key: "contraintes", label: "Contraintes", kind: "list", heading: false, style: "bullet", placeholder: "Nouvelle contrainte" }],
    },
    {
      title: "Livrables",
      aliases: ["livrable"],
      fields: [{ key: "livrables", label: "Livrables", kind: "list", heading: false, style: "bullet", placeholder: "Nouveau livrable" }],
    },
    {
      title: "Généralisation",
      fields: [{ key: "generalisation", label: "Généralisation", kind: "text", heading: false, placeholder: "Notion générale…" }],
    },
    {
      title: "Pistes de solution",
      aliases: ["piste de solutions", "pistes de solutions", "piste de solution", "recherche des pistes de solution", "hypotheses"],
      fields: [{ key: "pistes", label: "Pistes de solution", kind: "list", heading: false, style: "bullet", placeholder: "Nouvelle piste" }],
    },
    {
      title: "Plan d’action",
      aliases: ["plan d'action", "plan daction"],
      fields: [
        { key: "etude", label: "Études", kind: "list", heading: true, style: "bullet", aliases: ["etude"], placeholder: "Notion à étudier" },
        { key: "realisation", label: "Réalisation", kind: "list", heading: true, style: "bullet-numbered", aliases: ["realisations"], placeholder: "Action à réaliser" },
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

/** Numéro romain affiché pour chaque section (undefined si non numérotée). */
export function sectionNumbers(t: TemplateDef): (number | undefined)[] {
  let n = 0;
  return t.sections.map((s) => (s.unnumbered ? undefined : ++n));
}

export function emptyContent(t: TemplateDef): Content {
  const c: Content = {};
  for (const f of allFields(t)) c[f.key] = f.kind === "list" ? [] : "";
  return c;
}

/** Ne garde que les champs du template, en convertissant texte ↔ liste si le type d'un champ a changé. */
export function coerceContent(t: TemplateDef, raw: Content | undefined): Content {
  const out = emptyContent(t);
  if (!raw) return out;
  for (const f of allFields(t)) {
    const v: FieldValue | undefined = raw[f.key];
    if (v === undefined) continue;
    if (f.kind === "list") {
      if (Array.isArray(v)) out[f.key] = v as ListItem[];
      else if (v.trim())
        out[f.key] = v
          .split(/\r?\n/)
          .filter((l) => l.trim())
          .map((text, i) => ({ id: `${f.key}-${i}`, text: text.trim(), level: 0 }));
    } else {
      out[f.key] = Array.isArray(v) ? v.map((i) => i.text).filter(Boolean).join("\n") : v;
    }
  }
  return out;
}
