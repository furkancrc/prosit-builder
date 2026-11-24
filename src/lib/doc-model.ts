import type { Content, DocType, ListItem, Meta, RichBlock } from "./schema";
import { normalizeList } from "./schema";
import { coerceContent, getTemplate, type FieldDef, type ListStyle, type SectionDef } from "./templates";
import { formatDateFr } from "./meta";

/** Styles de mise en page disponibles (choisis dans l'éditeur ou les réglages). */
export const DOC_STYLES = {
  cesi: { label: "Boucle PBL (CESI)", description: "Bandeau noir, bloc titre jaune, rubriques I à XII, puces roses", font: "Arial" },
  classique: { label: "Classique (Word)", description: "Grand titre bleu, rubriques regroupées « I. » / « 1) », puces « - »", font: "Calibri" },
  rapport: { label: "Rapport (Times)", description: "Times, « Prosit retour / CER : » souligné, rubriques orange, sous-titres soulignés, puces « • »", font: "Times New Roman" },
} as const;
export type DocStyle = keyof typeof DOC_STYLES;

/** Représentation intermédiaire partagée par l'aperçu HTML et l'export .docx. */
export type Block =
  /** Titre de rubrique (niveau 1) : `title` en capitales (style CESI), `label` tel quel (style classique). */
  | { kind: "section"; title: string; label: string; num?: string; nav: number }
  /** Sous-titre numéroté « 1) Mots clés : » (style classique). */
  | { kind: "h2"; text: string; num: number; nav?: number }
  | { kind: "subheading"; text: string }
  | { kind: "para"; text: string }
  | { kind: "list"; style: ListStyle; items: ListItem[]; instance: number; withStatus?: boolean; asTable?: [string, string]; plan?: boolean }
  /** Légende des couleurs de statut (pistes de solution du retour). */
  | { kind: "legend" }
  | { kind: "roles"; items: { label: string; value: string }[] }
  | { kind: "empty"; text: string };

export interface DocModel {
  type: DocType;
  style: DocStyle;
  /** Titre du style classique (« Prosit Aller n°2 ») ou rapport (« Prosit retour : »). */
  heading: string;
  /** Ligne « Boucle PBL 2 : thème » du style rapport. */
  pbl: string;
  /** Bandeau noir : « PROSIT ALLER » / « PROSIT RETOUR ». */
  banner: string;
  /** Bloc jaune : « Boucle PBL : <thème> ». */
  title: string;
  /** Ligne d'informations sous le titre (numéro, bloc, auteur, groupe, date). */
  info: string;
  blocks: Block[];
}

/**
 * Style classique : regroupement des rubriques comme dans le template Word d'origine
 * (« I. Prendre connaissance… » → 1) Mots clés, 2) Contexte ; « II. Analyser le besoin » → …).
 */
const CLASSIC_GROUPS: { title: string; sections: string[] }[] = [
  { title: "Prendre connaissance de la situation et clarifier", sections: ["Rôles", "Mots clés", "Contexte"] },
  { title: "Analyser le besoin", sections: ["Problématique", "Contraintes", "Livrables"] },
];
const CLASSIC_LABELS: Record<string, string> = {
  Problématique: "Problème",
  "Pistes de solution": "Recherche des pistes de solution",
};

export function buildDocModel(meta: Meta, type: DocType, rawContent: Content, style: DocStyle = "cesi"): DocModel {
  const tpl = getTemplate(type);
  const content = coerceContent(tpl, rawContent);
  const blocks: Block[] = [];
  let listInstance = 0;

  // Retour : les sections propres au retour (Synthèse, Questions, AAV, Sources) restées vides sont
  // masquées ; la numérotation romaine suit les sections réellement affichées.
  const allerTitles = new Set(getTemplate("aller").sections.map((s) => s.title));
  const isFilled = (v: Content[string] | undefined) =>
    typeof v === "string" ? v.trim() !== "" : Array.isArray(v) && v.some((i) => i.text.trim() || i.detail?.trim() || i.blocks?.length);
  const visible = tpl.sections.filter((s) => type !== "retour" || allerTitles.has(s.title) || s.fields.some((f) => isFilled(content[f.key])));
  let counter = 0;

  const emitRoles = (section: SectionDef, always: boolean) => {
    const roles = section.fields.filter((f) => f.kind === "role");
    if (!roles.length) return;
    const items = roles.map((f) => ({ label: f.label, value: String(content[f.key] ?? "").trim() })).filter((r) => r.value);
    if (items.length) blocks.push({ kind: "roles", items });
    else if (always) blocks.push({ kind: "empty", text: "—" });
  };

  if (style !== "cesi") {
    // titres « I. » regroupant des sous-titres « 1) », sauf rubriques autonomes
    const byTitle = new Map(visible.map((s) => [s.title, s]));
    /** Entrée de navigation de l'éditeur (0 = en-tête, i + 1 = rubrique i du gabarit). */
    const navOf = (s: SectionDef) => tpl.sections.indexOf(s) + 1;
    const used = new Set<string>();
    for (const section of visible) {
      if (used.has(section.title)) continue;
      const group = CLASSIC_GROUPS.find((g) => g.sections.includes(section.title));
      const members = group ? group.sections.map((t) => byTitle.get(t)).filter((s): s is SectionDef => !!s) : [section];
      members.forEach((m) => used.add(m.title));
      const label = group?.title ?? CLASSIC_LABELS[section.title] ?? section.title;
      blocks.push({ kind: "section", title: label.toUpperCase(), label, num: toRoman(++counter), nav: navOf(members[0]) });
      let h2 = 0;
      for (const m of members) {
        const isRoles = m.fields.every((f) => f.kind === "role");
        if (isRoles) {
          // les rôles n'apparaissent que s'ils sont renseignés
          if (m.fields.some((f) => String(content[f.key] ?? "").trim())) {
            blocks.push({ kind: "h2", text: `${m.title} :`, num: ++h2, nav: navOf(m) });
            emitRoles(m, false);
          }
          continue;
        }
        if (group) blocks.push({ kind: "h2", text: `${CLASSIC_LABELS[m.title] ?? m.title} :`, num: ++h2, nav: navOf(m) });
        for (const f of m.fields) {
          if (f.kind === "role") continue;
          if (f.heading) blocks.push({ kind: "h2", text: `${f.label} :`, num: ++h2 });
          emitField(f);
        }
      }
    }
  } else {
    visible.forEach((section) => {
      const n = section.unnumbered ? undefined : ++counter;
      blocks.push({ kind: "section", title: section.title.toUpperCase(), label: section.title, num: n ? toRoman(n) : undefined, nav: tpl.sections.indexOf(section) + 1 });
      emitRoles(section, true);
      for (const f of section.fields) {
        if (f.kind === "role") continue;
        if (f.heading) blocks.push({ kind: "subheading", text: `${f.label} :` });
        emitField(f);
      }
    });
  }

  function emitField(f: FieldDef) {
      if (f.kind === "role") return;
      const v = content[f.key];
      if (f.kind === "text") {
        const paras = String(v ?? "")
          .split(/\r?\n/)
          .map((l) => l.trimEnd())
          .filter((l) => l.trim() !== "");
        if (paras.length === 0) blocks.push({ kind: "empty", text: "—" });
        for (const p of paras) blocks.push({ kind: "para", text: p });
      } else {
        const items = normalizeList((v as ListItem[]).filter((i) => i.text.trim() !== ""));
        if (items.length === 0) blocks.push({ kind: "empty", text: "—" });
        else {
          if (f.status) blocks.push({ kind: "legend" });
          // les définitions / statuts ne sont rendus que si le champ les prévoit
          const clean = items.map((i) => ({
            ...i,
            detail: f.detail ? i.detail?.trim() || undefined : undefined,
            status: f.status ? i.status : undefined,
            blocks: f.rich ? cleanBlocks(i.blocks) : undefined,
          }));
          blocks.push({ kind: "list", style: f.style, items: clean, instance: ++listInstance, withStatus: !!f.status, asTable: f.asTable, plan: f.plan });
        }
      }
  }

  const info = [
    // le style classique n'a pas de bloc « Boucle PBL : thème » : le thème passe dans la ligne d'infos
    style === "classique" && meta.theme,
    // le style rapport affiche déjà « Boucle PBL n : thème » en tête
    meta.numero && `Prosit n° ${meta.numero}`,
    meta.bloc,
    meta.auteur && (meta.groupe ? `${meta.auteur} (${meta.groupe})` : meta.auteur),
    !meta.auteur && meta.groupe,
    meta.date && formatDateFr(meta.date),
  ]
    .filter((x): x is string => !!x && x.trim() !== "")
    .join("  ·  ");

  return {
    type,
    style,
    // le prosit retour sert aussi de CER : il est titré « Prosit retour / CER » dans les trois styles
    heading:
      style === "rapport"
        ? `Prosit ${type === "aller" ? "aller" : "retour / CER"} :`
        : `Prosit ${type === "aller" ? "Aller" : "Retour / CER"}${meta.numero ? ` n°${meta.numero}` : ""}`,
    pbl: `Boucle PBL${meta.numero ? ` ${meta.numero}` : ""} : ${meta.theme || meta.nom || "…"}`,
    banner: type === "aller" ? "PROSIT ALLER" : "PROSIT RETOUR / CER",
    title: `Boucle PBL : ${meta.theme || meta.nom || "…"}`,
    info,
    blocks,
  };
}

/** Marqueur affiché pour un élément de liste (aperçu) — identique au .docx. */
export function listMarker(style: ListStyle, level: number, n: number): string {
  const letter = String.fromCharCode(96 + ((n - 1) % 26) + 1);
  if (style === "bullet") return "■";
  if (style === "numbered") return level === 0 ? `${n}.` : level === 1 ? `${letter}.` : `${toRoman(n).toLowerCase()}.`;
  if (level === 0) return "■";
  return level === 1 ? `${n}.` : `${letter}.`;
}

export function toRoman(n: number): string {
  const map: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

/** Compteurs de numérotation par niveau (remis à zéro quand on remonte d'un niveau). */
export function numberItems(items: ListItem[]): number[] {
  const counters = [0, 0, 0];
  return items.map((it) => {
    counters[it.level]++;
    for (let l = it.level + 1; l < counters.length; l++) counters[l] = 0;
    return counters[it.level];
  });
}

/** Retire les blocs vides (texte vide, grille sans image, tableau sans contenu). */
export function cleanBlocks(blocks: RichBlock[] | undefined): RichBlock[] | undefined {
  const out = (blocks ?? []).filter((b) => {
    if (b.type === "text") return b.text.trim() !== "";
    if (b.type === "images") return b.images.length > 0;
    return b.rows.some((r) => r.some((c) => c.trim() !== ""));
  });
  return out.length ? out : undefined;
}

/** Identifiants de toutes les images utilisées dans un contenu (pour les précharger à l'export). */
export function collectAssetIds(content: Content): string[] {
  const ids = new Set<string>();
  for (const v of Object.values(content)) {
    if (!Array.isArray(v)) continue;
    for (const it of v) for (const b of it.blocks ?? []) if (b.type === "images") b.images.forEach((im) => ids.add(im.assetId));
  }
  return [...ids];
}
