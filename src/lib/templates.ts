import { normalizeList, type Content, type DocType, type FieldValue, type ListItem } from "./schema";

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
  | (FieldBase & {
      kind: "list";
      style: ListStyle;
      /** Libellé du champ de définition / explication sous chaque élément (prosit retour). */
      detail?: string;
      /** Chaque élément porte un statut validée / partielle / non validée (pistes du retour). */
      status?: boolean;
      /** Contenu riche (paragraphes, images, tableaux) possible sous chaque élément. */
      rich?: boolean;
      /** Rendu en tableau à deux colonnes (élément | définition) dans le document, comme dans un CER. */
      asTable?: [string, string];
      /** Éléments structurés du plan d'action (description, points, étapes, intérêt). */
      plan?: boolean;
    })
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
        { key: "etude", label: "Études", kind: "list", heading: true, style: "bullet", plan: true, aliases: ["etude"], placeholder: "Notion à étudier" },
        { key: "realisation", label: "Réalisation", kind: "list", heading: true, style: "bullet-numbered", plan: true, aliases: ["realisations"], placeholder: "Action à réaliser" },
      ],
    },
  ],
};

/** Ajouts du prosit retour par champ de liste : libellé de la définition, statut éventuel. */
const RETOUR_LIST_EXTRAS: Record<string, { detail: string; status?: boolean; rich?: boolean; asTable?: [string, string] }> = {
  motsInconnus: { detail: "Définition", rich: true, asTable: ["Mot clé", "Définition"] },
  contraintes: { detail: "Explication", rich: true },
  livrables: { detail: "Réalisé / commentaire", rich: true },
  pistes: { detail: "Justification", status: true, rich: true },
  // plan d'action : la description / les points / les étapes remplacent l'ancien champ libre
  etude: { detail: "", rich: true },
  realisation: { detail: "", rich: true },
};

/**
 * Prosit retour (qui sert aussi de CER) : mêmes rubriques que l'aller, chaque élément reçoit une
 * définition ou une explication et du contenu riche (images, tableaux), les pistes un statut coloré,
 * puis viennent la synthèse du cours, les questions du tuteur, les AAV et les sources
 * (d'après « Prosit Retour SI - 1.docx », « PrositRetourPBL1.docx » et « CER_1_Prosit_1.pdf »).
 */
export const RETOUR_TEMPLATE: TemplateDef = {
  type: "retour",
  label: "Prosit retour",
  sections: [
    ...ALLER_TEMPLATE.sections.map((s) => ({
      ...s,
      fields: s.fields.map((f): FieldDef => (f.kind === "list" && RETOUR_LIST_EXTRAS[f.key] ? { ...f, ...RETOUR_LIST_EXTRAS[f.key] } : f)),
    })),
    {
      title: "Synthèse",
      aliases: ["synthese du cours", "cer", "notions", "cours"],
      fields: [
        { key: "syntheseIntro", label: "Introduction", kind: "text", heading: false, placeholder: "Un **système d’information** est l’ensemble organisé des ressources qui…" },
        {
          key: "notions",
          label: "Notions",
          kind: "list",
          heading: false,
          style: "bullet",
          detail: "Explication",
          rich: true,
          placeholder: "Infrastructure ≠ S.I.",
        },
      ],
    },
    {
      title: "Questions du tuteur",
      aliases: ["questions", "question", "question du tuteur", "questions du tuteur"],
      fields: [
        { key: "questions", label: "Questions", kind: "list", heading: false, style: "bullet", detail: "Réponse", rich: true, placeholder: "Qu’est-ce qu’un SI ?" },
      ],
    },
    {
      title: "AAV",
      aliases: ["acquis d'apprentissage vises", "objectifs d'apprentissage", "objectifs", "aav acquis d'apprentissage vises"],
      fields: [
        {
          key: "objectifs",
          label: "Acquis d’apprentissage visés",
          kind: "list",
          heading: false,
          style: "bullet",
          // pas de statut coloré : le nombre entre crochets est l'importance de l'acquis (ex. « [3] … »)
          detail: "Commentaire",
          placeholder: "[3] Schématiser le SI avec un logiciel adapté",
        },
      ],
    },
    {
      title: "Sources",
      aliases: ["sources complementaires", "bibliographie", "references"],
      fields: [{ key: "sources", label: "Sources", kind: "list", heading: false, style: "bullet", placeholder: "manager-go.com (« Système d’information »)" }],
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

/**
 * Reporte dans le retour ce qui manque par rapport à l'aller, sans rien écraser :
 * champs texte / rôles vides remplis, éléments de liste absents (même texte) ajoutés.
 * Les définitions et statuts déjà saisis dans le retour sont conservés.
 */
export function mergeAllerIntoRetour(aller: Content, retour: Content): { content: Content; added: number } {
  const out = coerceContent(RETOUR_TEMPLATE, retour);
  const src = coerceContent(ALLER_TEMPLATE, aller);
  let added = 0;
  for (const f of allFields(ALLER_TEMPLATE)) {
    const a = src[f.key];
    const r = out[f.key];
    if (typeof a === "string") {
      // texte / rôle vide dans le retour → celui de l'aller
      if (typeof r === "string" && !r.trim() && a.trim()) {
        out[f.key] = a;
        added++;
      }
    } else if (Array.isArray(a) && Array.isArray(r)) {
      // le retour prime : les éléments de l'aller ne font que combler ce qui manque
      const { items, added: n } = mergeLists(a, r, false);
      if (n) {
        out[f.key] = items;
        added += n;
      }
    }
  }
  return { content: out, added };
}

/** Clé de comparaison : minuscules, sans accents ni ponctuation, sans le marquage **gras**. */
function textKey(s: string): string {
  return s
    .replace(/\*\*/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Deux éléments parlent-ils de la même chose ? Même texte normalisé, l'un qui prolonge l'autre
 * (« Routeur » / « Routeur : équipement… »), ou mots très largement communs (petite reformulation).
 */
export function sameItem(a: string, b: string): boolean {
  const ka = textKey(a);
  const kb = textKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  if (short.length >= 6 && long.startsWith(short + " ")) return true;
  const wa = new Set(ka.split(" ").filter((w) => w.length > 2));
  const wb = new Set(kb.split(" ").filter((w) => w.length > 2));
  if (wa.size < 3 || wb.size < 3) return false;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size) >= 0.8;
}

/**
 * Fusionne une liste de l'aller dans celle du retour : les éléments du retour (avec leurs
 * définitions, statuts, images…) sont gardés tels quels ; chaque élément de l'aller absent
 * du retour est inséré juste après l'élément qui le précédait dans l'aller, pour garder l'ordre.
 */
function mergeLists(incoming: ListItem[], base: ListItem[], enrich = true): { items: ListItem[]; added: number; enriched: number } {
  const items = base
    .filter((i) => i.text.trim() || i.detail?.trim() || i.blocks?.length || i.description?.trim() || i.points?.length || i.etapes?.length)
    .map((i) => ({ ...i }));
  let added = 0;
  let enriched = 0;
  let cursor = -1; // position (dans items) du dernier élément entrant retrouvé ou inséré
  for (const a of incoming) {
    if (!a.text.trim()) continue;
    const found = items.findIndex((r) => sameItem(r.text, a.text));
    if (found >= 0 && !enrich) {
      cursor = found;
      continue;
    }
    if (found >= 0) {
      // élément déjà présent : on le complète sans rien écraser
      const r = items[found];
      let changed = false;
      if (a.detail?.trim() && (!r.detail?.trim() || moreComplete(a.detail, r.detail))) {
        r.detail = a.detail;
        changed = true;
      }
      if (a.status && !r.status) {
        r.status = a.status;
        changed = true;
      }
      if (a.blocks?.length && !r.blocks?.length) {
        r.blocks = a.blocks;
        changed = true;
      }
      // élément structuré du plan d'action : chaque partie manquante est reprise
      if (a.description?.trim() && !r.description?.trim()) {
        r.description = a.description;
        changed = true;
      }
      if (a.points?.length && !r.points?.length) {
        r.points = a.points;
        changed = true;
      }
      if (a.etapes?.length && !r.etapes?.length) {
        r.etapes = a.etapes;
        changed = true;
      }
      if (a.interet?.trim() && !r.interet?.trim()) {
        r.interet = a.interet;
        changed = true;
      }
      if (moreComplete(a.text, r.text)) {
        r.text = a.text;
        changed = true;
      }
      if (changed) enriched++;
      cursor = found;
      continue;
    }
    // insérer après le curseur, et après les sous-éléments de l'élément qui s'y trouve
    let at = cursor + 1;
    if (cursor >= 0) while (at < items.length && items[at].level > items[cursor].level) at++;
    items.splice(at, 0, { ...a, id: `${a.id}-m` });
    cursor = at;
    added++;
  }
  return { items: normalizeList(items), added, enriched };
}

/** `a` reprend tout `b` et en dit davantage (même texte, plus complet) ? */
function moreComplete(a: string, b: string): boolean {
  const ka = textKey(a);
  const kb = textKey(b);
  return ka.length > kb.length + 2 && ka.includes(kb);
}

/** Meilleur texte entre l'existant et l'importé : le vide cède, le plus complet l'emporte, sinon l'existant est gardé. */
function chooseText(existing: string, incoming: string): { value: string; outcome: "same" | "filled" | "improved" | "kept" } {
  if (!incoming.trim() || textKey(incoming) === textKey(existing)) return { value: existing, outcome: "same" };
  if (!existing.trim()) return { value: incoming, outcome: "filled" };
  if (moreComplete(incoming, existing)) return { value: incoming, outcome: "improved" };
  return { value: existing, outcome: "kept" };
}

export interface ImportMergeStats {
  /** Champs vides remplis + éléments de liste ajoutés. */
  added: number;
  /** Éléments ou textes existants complétés (définition, statut, images, version plus complète). */
  enriched: number;
  /** Champs gardés tels quels car le fichier contenait une version différente. */
  kept: string[];
}

/**
 * Fusionne le contenu d'un fichier importé dans un prosit existant, sans rien perdre :
 * un champ vide est rempli, un texte existant n'est remplacé que par une version plus complète
 * du même texte, les éléments de liste déjà présents sont complétés et les nouveaux insérés à leur place.
 */
export function mergeImported(type: DocType, existing: Content, imported: Content): { content: Content; stats: ImportMergeStats } {
  const tpl = getTemplate(type);
  const out = coerceContent(tpl, existing);
  const inc = coerceContent(tpl, imported);
  const stats: ImportMergeStats = { added: 0, enriched: 0, kept: [] };
  for (const f of allFields(tpl)) {
    const a = inc[f.key];
    const r = out[f.key];
    if (typeof a === "string" && typeof r === "string") {
      const { value, outcome } = chooseText(r, a);
      out[f.key] = value;
      if (outcome === "filled") stats.added++;
      if (outcome === "improved") stats.enriched++;
      if (outcome === "kept") stats.kept.push(f.label);
    } else if (Array.isArray(a) && Array.isArray(r)) {
      const { items, added, enriched } = mergeLists(a, r);
      out[f.key] = items;
      stats.added += added;
      stats.enriched += enriched;
    }
  }
  return { content: out, stats };
}

/** Partie « aller » d'un contenu de retour : mêmes éléments, sans définitions, statuts ni images. */
export function retourToAller(retour: Content): Content {
  const c = coerceContent(ALLER_TEMPLATE, retour);
  for (const [k, v] of Object.entries(c)) {
    if (Array.isArray(v)) c[k] = v.map((i) => ({ id: `${i.id}-a`, text: i.text, level: i.level }));
  }
  return c;
}

/**
 * Contenu effectif du prosit retour (export, aperçu, présentation) : le retour enrichi de tout
 * ce que l'aller contient et que le retour n'a pas encore, sans modifier les données saisies.
 */
export function effectiveRetourContent(aller: Content, retour: Content): Content {
  return mergeAllerIntoRetour(aller, retour).content;
}

export function isContentEmpty(c: Content): boolean {
  return Object.values(c).every((v) => (typeof v === "string" ? !v.trim() : !v.some((i) => i.text.trim())));
}
