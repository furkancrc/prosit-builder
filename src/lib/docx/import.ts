import JSZip from "jszip";
import type { Content, DocType, ListItem, MetaPatch } from "../schema";
import { MAX_LEVEL, normalizeList } from "../schema";
import { allFields, emptyContent, getTemplate, type FieldDef } from "../templates";

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
const isH1 = (s: string) => /^(titre1|heading1)$/i.test(s);
const isH2 = (s: string) => /^(titre2|heading2)$/i.test(s);
const isListStyle = (s: string) => /^(paragraphedeliste|listparagraph)$/i.test(s);

export interface ImportResult {
  type: DocType | null;
  meta: MetaPatch;
  content: Content;
  unmatched: string[];
}

let idSeq = 0;
const newId = () => `imp${Date.now().toString(36)}${(idSeq++).toString(36)}`;

/** Analyse le XML d'un prosit et pré-remplit les champs du template correspondant. */
export function importFromXml(documentXml: string, forceType?: DocType): ImportResult {
  const paras = parseParagraphs(documentXml);
  const meta: MetaPatch = {};
  let type: DocType | null = forceType ?? null;

  const titlePara = paras.find((p) => isTitle(p.style) && p.text);
  if (titlePara) {
    const t = normKey(titlePara.text);
    if (!type) type = t.includes("retour") ? "retour" : t.includes("aller") ? "aller" : null;
    const num = /n\s*[°º]\s*(\w+)/i.exec(titlePara.text)?.[1] ?? /(\d+)\s*$/.exec(titlePara.text)?.[1];
    if (num) meta.numero = num;
  }

  const tpl = getTemplate(type ?? "aller");
  const fields = allFields(tpl);
  const byH2 = new Map<string, FieldDef>();
  const byH1 = new Map<string, FieldDef>();
  for (const s of tpl.sections) {
    for (const f of s.fields) {
      for (const k of [f.label, ...(f.aliases ?? [])]) byH2.set(normKey(k), f);
    }
    const solo = s.fields.length === 1 && !s.fields[0].heading ? s.fields[0] : undefined;
    if (solo) for (const k of [s.title, ...(s.aliases ?? [])]) byH1.set(normKey(k), solo);
  }
  const matchHeading = (text: string, map: Map<string, FieldDef>) => {
    const k = normKey(text);
    if (!k) return undefined;
    return map.get(k) ?? [...map.entries()].find(([key]) => k.startsWith(key) || (key.length > 4 && k.includes(key)))?.[1];
  };

  const content = emptyContent(tpl);
  const lists = new Map<string, { text: string; rawLevel: number }[]>();
  const texts = new Map<string, string[]>();
  const unmatched: string[] = [];
  let current: FieldDef | undefined;

  for (const p of paras) {
    if (isTitle(p.style)) continue;
    if (isH1(p.style)) {
      current = matchHeading(p.text, byH1);
      continue;
    }
    if (isH2(p.style)) {
      current = matchHeading(p.text, byH2);
      if (!current && p.text) unmatched.push(p.text);
      continue;
    }
    if (!current || !p.text) continue;
    if (current.kind === "text") {
      texts.set(current.key, [...(texts.get(current.key) ?? []), p.text]);
    } else {
      const manual = /^\s*\d+\s*[.)](?:\s+|(?=[^\d\s]))/.exec(p.text) ?? /^\s*[a-z]\s*[.)]\s+/i.exec(p.text);
      const isItem = p.numbered || isListStyle(p.style) || !!manual;
      const text = manual && !p.numbered ? p.text.slice(manual[0].length).trim() : p.text;
      const rawLevel = p.numbered ? p.ilvl : manual ? 0 : 0;
      if (isItem || text) lists.set(current.key, [...(lists.get(current.key) ?? []), { text, rawLevel }]);
    }
  }

  for (const f of fields) {
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
