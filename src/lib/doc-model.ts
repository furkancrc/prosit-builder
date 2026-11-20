import type { Content, DocType, ListItem, Meta, RichBlock } from "./schema";
import { normalizeList } from "./schema";
import { coerceContent, getTemplate, sectionNumbers, type ListStyle } from "./templates";
import { formatDateFr } from "./meta";

/** Représentation intermédiaire partagée par l'aperçu HTML et l'export .docx. */
export type Block =
  | { kind: "section"; title: string; num?: string }
  | { kind: "subheading"; text: string }
  | { kind: "para"; text: string }
  | { kind: "list"; style: ListStyle; items: ListItem[]; instance: number; withStatus?: boolean; asTable?: [string, string] }
  /** Légende des couleurs de statut (pistes de solution du retour). */
  | { kind: "legend" }
  | { kind: "roles"; items: { label: string; value: string }[] }
  | { kind: "empty"; text: string };

export interface DocModel {
  type: DocType;
  /** Bandeau noir : « PROSIT ALLER » / « PROSIT RETOUR ». */
  banner: string;
  /** Bloc jaune : « Boucle PBL : <thème> ». */
  title: string;
  /** Ligne d'informations sous le titre (numéro, bloc, auteur, groupe, date). */
  info: string;
  blocks: Block[];
}

export function buildDocModel(meta: Meta, type: DocType, rawContent: Content): DocModel {
  const tpl = getTemplate(type);
  const content = coerceContent(tpl, rawContent);
  const nums = sectionNumbers(tpl);
  const blocks: Block[] = [];
  let listInstance = 0;

  tpl.sections.forEach((section, si) => {
    const n = nums[si];
    blocks.push({ kind: "section", title: section.title.toUpperCase(), num: n ? toRoman(n) : undefined });

    const roles = section.fields.filter((f) => f.kind === "role");
    if (roles.length) {
      const items = roles.map((f) => ({ label: f.label, value: String(content[f.key] ?? "").trim() })).filter((r) => r.value);
      blocks.push(items.length ? { kind: "roles", items } : { kind: "empty", text: "—" });
    }

    for (const f of section.fields) {
      if (f.kind === "role") continue;
      if (f.heading) blocks.push({ kind: "subheading", text: `${f.label} :` });
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
          blocks.push({ kind: "list", style: f.style, items: clean, instance: ++listInstance, withStatus: !!f.status, asTable: f.asTable });
        }
      }
    }
  });

  const info = [
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
