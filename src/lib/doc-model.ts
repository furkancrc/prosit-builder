import type { Content, DocType, ListItem, Meta } from "./schema";
import { normalizeList } from "./schema";
import { coerceContent, getTemplate, type ListStyle } from "./templates";
import { docTitle, formatDateFr } from "./meta";

/** Représentation intermédiaire partagée par l'aperçu HTML et l'export .docx. */
export type Block =
  | { kind: "h1"; text: string; index: number }
  | { kind: "h2"; text: string; index: number; section: number }
  | { kind: "para"; text: string }
  | { kind: "list"; style: ListStyle; items: ListItem[]; instance: number }
  | { kind: "empty"; text: string };

export interface DocModel {
  type: DocType;
  title: string;
  header: string;
  info: { label: string; value: string }[];
  blocks: Block[];
}

export function buildDocModel(meta: Meta, type: DocType, rawContent: Content): DocModel {
  const tpl = getTemplate(type);
  const content = coerceContent(tpl, rawContent);
  const blocks: Block[] = [];
  let listInstance = 0;

  tpl.sections.forEach((section, si) => {
    blocks.push({ kind: "h1", text: section.title, index: si + 1 });
    let h2 = 0;
    for (const f of section.fields) {
      if (f.heading) blocks.push({ kind: "h2", text: `${f.label} :`, index: ++h2, section: si });
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
        else blocks.push({ kind: "list", style: f.style, items, instance: ++listInstance });
      }
    }
  });

  const info = [
    { label: "Thème", value: meta.theme },
    { label: "Bloc", value: meta.bloc },
    { label: "Auteur", value: meta.auteur },
    { label: "Groupe", value: meta.groupe },
    { label: "Date", value: formatDateFr(meta.date) },
  ].filter((i) => i.value.trim() !== "");

  return {
    type,
    title: docTitle(meta, type),
    header: [meta.nom, meta.theme].filter(Boolean).join(" — "),
    info,
    blocks,
  };
}

/** Marqueur affiché pour un élément de liste (aperçu) — calqué sur la numérotation Word. */
export function listMarker(style: ListStyle, level: number, n: number): string {
  const bullets = ["-", "o", "▪"];
  const numbered = (lvl: number) => (lvl === 0 ? `${n}.` : lvl === 1 ? `${String.fromCharCode(96 + ((n - 1) % 26) + 1)}.` : `${toRoman(n).toLowerCase()}.`);
  if (style === "bullet") return bullets[level] ?? "-";
  if (style === "numbered") return numbered(level);
  // bullet-numbered
  if (level === 0) return "-";
  return level === 1 ? `${n}.` : `${String.fromCharCode(96 + ((n - 1) % 26) + 1)}.`;
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
