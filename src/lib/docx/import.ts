import JSZip from "jszip";
import type { Content, DocType, ListItem, MetaPatch } from "../schema";
import { MAX_LEVEL, normalizeList } from "../schema";
import { allFields, emptyContent, getTemplate, type FieldDef, type SectionDef } from "../templates";

interface RawPara {
  style: string;
  text: string;
  numbered: boolean;
  ilvl: number;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

/** Clé de comparaison : minuscules, sans accents, sans espaces ni ponctuation. */
export function normKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function parseParagraphs(documentXml: string): RawPara[] {
  const body = documentXml.split(/<w:body>/)[1] ?? documentXml;
  const paras: RawPara[] = [];
  const re = /<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g;
  for (const m of body.match(re) ?? []) {
    const style = /<w:pStyle w:val="([^"]+)"/.exec(m)?.[1] ?? "";
    const numPr = /<w:numPr>([\s\S]*?)<\/w:numPr>/.exec(m)?.[1];
    const numId = numPr ? /<w:numId w:val="(\d+)"/.exec(numPr)?.[1] : undefined;
    const ilvl = numPr ? Number(/<w:ilvl w:val="(\d+)"/.exec(numPr)?.[1] ?? 0) : 0;
    let text = "";
    for (const t of m.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) ?? []) {
      if (t.startsWith("<w:tab")) text += " ";
      else if (t.startsWith("<w:br")) text += "\n";
      else text += decode(t.replace(/<[^>]+>/g, ""));
    }
    paras.push({ style, text: text.replace(/ /g, " ").trim(), numbered: !!numId && numId !== "0", ilvl });
  }
  return paras;
}

const isTitle = (s: string) => /^(titre|title)$/i.test(s);
const isHeadingStyle = (s: string) => /^(titre|heading)[12]$/i.test(s);
const isListStyle = (s: string) => /^(paragraphedeliste|listparagraph)$/i.test(s);
const BULLET = /^\s*[■▪•●◦□‣–]\s*/;
const ROMAN_PREFIX = /^\s*[IVXLC]+\s*[.)]?\s+(?=\S)/;

export interface ImportResult {
  type: DocType | null;
  meta: MetaPatch;
  content: Content;
  unmatched: string[];
}

let idSeq = 0;
const newId = () => `imp${Date.now().toString(36)}${(idSeq++).toString(36)}`;

type Target = { section: SectionDef; field?: FieldDef };

/**
 * Analyse le XML d'un prosit et pré-remplit les champs du template.
 * Gère l'ancien format (styles Titre 1 / Titre 2) et le format « Boucle PBL »
 * (titres de section dans des tableaux, puces « ■ » en texte).
 */
export function importFromXml(documentXml: string, forceType?: DocType): ImportResult {
  const paras = parseParagraphs(documentXml);
  const meta: MetaPatch = {};
  let type: DocType | null = forceType ?? null;

  // Type, numéro et thème
  for (const p of paras.slice(0, 12)) {
    const k = normKey(p.text);
    if (!type && /^prosit(aller|retour)/.test(k)) type = k.includes("retour") ? "retour" : "aller";
    if (isTitle(p.style) && p.text) {
      const num = /n\s*[°º]\s*(\w+)/i.exec(p.text)?.[1] ?? /(\d+)\s*$/.exec(p.text)?.[1];
      if (num) meta.numero = num;
    }
    const infoNum = /^prosit\s+n\s*[°º]\s*(\w+)/i.exec(p.text);
    if (infoNum && !meta.numero) meta.numero = infoNum[1];
    const pbl = /^boucle\s+pbl\s*:\s*(.+)$/i.exec(p.text);
    if (pbl) meta.theme = pbl[1].trim();
  }

  const tpl = getTemplate(type ?? "aller");
  const headings = new Map<string, Target>();
  for (const s of tpl.sections) {
    const solo = s.fields.length === 1 ? s.fields[0] : undefined;
    for (const k of [s.title, ...(s.aliases ?? [])]) headings.set(normKey(k), { section: s, field: solo });
    for (const f of s.fields) {
      if (f.kind === "role") continue;
      for (const k of [f.label, ...(f.aliases ?? [])]) if (!headings.has(normKey(k))) headings.set(normKey(k), { section: s, field: f });
    }
  }
  const lookup = (text: string, fuzzy: boolean): Target | undefined => {
    const k = normKey(text.replace(ROMAN_PREFIX, "").replace(/:\s*$/, ""));
    if (!k) return undefined;
    const exact = headings.get(k);
    if (exact || !fuzzy) return exact;
    return [...headings.entries()].find(([key]) => key.length > 4 && (k.startsWith(key) || key.startsWith(k)))?.[1];
  };

  const content = emptyContent(tpl);
  const lists = new Map<string, { text: string; rawLevel: number }[]>();
  const texts = new Map<string, string[]>();
  const unmatched: string[] = [];
  let current: Target | undefined;

  for (const p of paras) {
    if (isTitle(p.style) || !p.text) continue;
    if (/^prosit(aller|retour)$/.test(normKey(p.text)) || /^boucle\s+pbl\s*:/i.test(p.text)) continue;

    // Titres : style Word, ou paragraphe court reconnu (format tableau)
    if (isHeadingStyle(p.style)) {
      const t = lookup(p.text, true);
      if (t) current = t;
      else {
        // un Titre 1 inconnu (ex. « Analyser le besoin ») ouvre une zone neutre
        if (/2$/.test(p.style)) unmatched.push(p.text);
        current = undefined;
      }
      continue;
    }
    if (p.text.length <= 60 && !BULLET.test(p.text)) {
      const t = lookup(p.text, false);
      if (t) {
        current = t;
        continue;
      }
    }
    if (!current) continue;

    // Rôles : « Animateur : Alice »
    if (!current.field || current.field.kind === "role") {
      const m = /^(.+?)\s*:\s*(.*)$/.exec(p.text.replace(BULLET, ""));
      const role = m && current.section.fields.find((f) => f.kind === "role" && [f.label, ...(f.aliases ?? [])].some((l) => normKey(l) === normKey(m[1])));
      if (role && m) content[role.key] = m[2].trim();
      continue;
    }

    const field = current.field;
    if (field.kind === "text") {
      texts.set(field.key, [...(texts.get(field.key) ?? []), p.text.replace(BULLET, "")]);
    } else if (field.kind === "list") {
      const bullet = BULLET.exec(p.text);
      const manual = bullet ? null : (/^\s*\d+\s*[.)](?:\s+|(?=[^\d\s]))/.exec(p.text) ?? /^\s*[a-z]\s*[.)]\s+/i.exec(p.text));
      const prefix = bullet ?? (p.numbered ? null : manual);
      const text = prefix ? p.text.slice(prefix[0].length).trim() : p.text;
      const rawLevel = p.numbered ? p.ilvl : 0;
      if (text) lists.set(field.key, [...(lists.get(field.key) ?? []), { text, rawLevel }]);
    }
  }

  for (const f of allFields(tpl)) {
    if (f.kind === "text" && texts.has(f.key)) content[f.key] = texts.get(f.key)!.join("\n");
    if (f.kind === "list" && lists.has(f.key)) {
      const raw = lists.get(f.key)!;
      const min = Math.min(...raw.map((r) => r.rawLevel));
      const items: ListItem[] = raw.map((r) => ({ id: newId(), text: r.text, level: Math.min(MAX_LEVEL, r.rawLevel - min) }));
      content[f.key] = normalizeList(items);
    }
  }

  return { type, meta, content, unmatched };
}

export async function importDocx(buf: ArrayBuffer | Buffer, forceType?: DocType): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("Fichier .docx invalide : word/document.xml introuvable");
  return importFromXml(xml, forceType);
}
