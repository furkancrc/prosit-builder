import JSZip from "jszip";
import type { Content, DocType, ListItem, MetaPatch, PisteStatus, RichBlock } from "../schema";
import { MAX_LEVEL, STATUS_META, normalizeList } from "../schema";
import { allFields, emptyContent, getTemplate, type FieldDef, type SectionDef } from "../templates";

interface RawPara {
  kind: "p";
  style: string;
  text: string;
  numbered: boolean;
  ilvl: number;
  /** Couleurs du texte, fonds (w:shd) et surlignages (HL:nom) du paragraphe. */
  colors: string[];
  /** Images (identifiants de relation r:embed) contenues dans le paragraphe. */
  images: string[];
  /** Paragraphe centré en italique : légende d'image. */
  caption: boolean;
}

interface RawTable {
  kind: "table";
  rows: { text: string; images: string[] }[][];
  /** Paragraphes du tableau, pour les tableaux de mise en page (titres, bandeau). */
  paras: RawPara[];
}

type Node = RawPara | RawTable;

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

function parsePara(m: string): RawPara {
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
  const colors = [
    ...[...m.matchAll(/<w:(?:color w:val|shd [^>]*?w:fill)="([0-9A-Fa-f]{6})"/g)].map((c) => c[1].toUpperCase()),
    ...[...m.matchAll(/<w:highlight w:val="(\w+)"/g)].map((c) => `HL:${c[1].toLowerCase()}`),
  ];
  const images = [...m.matchAll(/<a:blip [^>]*?r:embed="([^"]+)"/g)].map((c) => c[1]);
  const caption = /<w:jc w:val="center"\/>/.test(m) && /<w:i\/>|<w:i w:val="(?:1|true)"\/>/.test(m);
  return { kind: "p", style, text: text.replace(/ /g, " ").trim(), numbered: !!numId && numId !== "0", ilvl, colors, images, caption };
}

const PARA_RE = /<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g;

/** Suite des paragraphes et tableaux de premier niveau du corps du document. */
export function parseBody(documentXml: string): Node[] {
  const body = documentXml.split(/<w:body>/)[1] ?? documentXml;
  const nodes: Node[] = [];
  for (const m of body.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) ?? []) {
    if (!m.startsWith("<w:tbl>")) {
      nodes.push(parsePara(m));
      continue;
    }
    const rows = (m.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []).map((tr) =>
      (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map((tc) => {
        const ps = (tc.match(PARA_RE) ?? []).map(parsePara);
        return { text: ps.map((p) => p.text).filter(Boolean).join("\n"), images: ps.flatMap((p) => p.images) };
      }),
    );
    nodes.push({ kind: "table", rows, paras: (m.match(PARA_RE) ?? []).map(parsePara) });
  }
  return nodes;
}

/** Paragraphes seuls (utilisé par les tests et pour un aperçu rapide). */
export function parseParagraphs(documentXml: string): RawPara[] {
  return parseBody(documentXml).flatMap((n) => (n.kind === "p" ? [n] : n.paras));
}

const isTitle = (s: string) => /^(titre|title)$/i.test(s);
const isHeadingStyle = (s: string) => /^(titre|heading)[12]$/i.test(s);
const isListStyle = (s: string) => /^(paragraphedeliste|listparagraph)$/i.test(s);
const BULLET = /^\s*[■▪•●◦□‣–·]\s*/;
const ROMAN_PREFIX = /^\s*[IVXLC]+\s*[.)]?\s+(?=\S)/;

/** Surlignages Word nommés → statut (vert = validée, jaune / orange = partielle, rouge = non validée). */
const HL_STATUS: Record<string, PisteStatus> = {
  "HL:green": "valid",
  "HL:brightgreen": "valid",
  "HL:darkgreen": "valid",
  "HL:yellow": "partial",
  "HL:darkyellow": "partial",
  "HL:red": "invalid",
  "HL:darkred": "invalid",
};

function statusFromColors(colors: string[]): PisteStatus | undefined {
  for (const c of colors) {
    if (HL_STATUS[c]) return HL_STATUS[c];
    const st = (Object.keys(STATUS_META) as PisteStatus[]).find(
      (s) => STATUS_META[s].color.slice(1).toUpperCase() === c || STATUS_META[s].highlight.slice(1).toUpperCase() === c,
    );
    if (st) return st;
    // fonds « purs » utilisés à la main : 00FF00 vert, FFFF00 jaune, FF0000 rouge
    if (c === "00FF00") return "valid";
    if (c === "FFFF00" || c === "FFC000") return "partial";
    if (c === "FF0000") return "invalid";
  }
  return undefined;
}

export interface ImportResult {
  type: DocType | null;
  meta: MetaPatch;
  content: Content;
  unmatched: string[];
}

let idSeq = 0;
const newId = () => `imp${Date.now().toString(36)}${(idSeq++).toString(36)}`;

type Target = { section: SectionDef; field?: FieldDef };
type DraftItem = { text: string; rawLevel: number; detail?: string; status?: PisteStatus; blocks: RichBlock[] };

/**
 * Analyse le XML d'un prosit et pré-remplit les champs du template.
 * Gère l'ancien format (styles Titre 1 / Titre 2), le format « Boucle PBL »
 * (titres de section dans des tableaux, puces « ■ ») et, pour le retour,
 * les définitions, statuts colorés, images et tableaux sous chaque élément.
 *
 * @param images relation r:embed → identifiant d'image enregistrée (voir importDocx)
 */
export function importFromXml(
  documentXml: string,
  forceType?: DocType,
  images: Map<string, string> = new Map(),
  styleNames: Map<string, string> = new Map(),
): ImportResult {
  const nodes = parseBody(documentXml);
  // styles à identifiant opaque (ex. « 139 ») → nom normalisé (« heading1 », « listparagraph »)
  if (styleNames.size) {
    const fix = (p: RawPara) => {
      const name = styleNames.get(p.style);
      if (name) p.style = name.replace(/\s+/g, "");
    };
    nodes.forEach((n) => (n.kind === "p" ? fix(n) : n.paras.forEach(fix)));
  }
  const flat = nodes.flatMap((n) => (n.kind === "p" ? [n] : n.paras));
  const meta: MetaPatch = {};
  // Le type lu dans le fichier l'emporte ; `forceType` (onglet ouvert, nom du fichier) n'est qu'un indice
  let type: DocType | null = null;

  // Type, numéro et thème
  for (const p of flat.slice(0, 14)) {
    const k = normKey(p.text);
    if (!type && /^prosit(aller|retour)/.test(k)) type = k.includes("retour") ? "retour" : "aller";
    if (isTitle(p.style) && p.text) {
      const num = /n\s*[°º]\s*(\w+)/i.exec(p.text)?.[1] ?? /(\d+)\s*$/.exec(p.text)?.[1];
      if (num) meta.numero = num;
    }
    const infoNum = /^prosit\s+n\s*[°º]\s*(\w+)/i.exec(p.text);
    if (infoNum && !meta.numero) meta.numero = infoNum[1];
    const pbl = /^boucle\s+pbl(?:\s*\d+)?\s*:\s*(.+)$/i.exec(p.text);
    if (pbl && !meta.theme) meta.theme = pbl[1].trim();
  }
  // rubriques qui n'existent que dans un retour / CER
  if (!type && flat.some((p) => p.text.length < 60 && /^(?:[ivxlc]+)?(aav$|questionsdututeur|questiond|objectifsdapprentissage)/.test(normKey(p.text)))) type = "retour";
  type = type ?? forceType ?? null;

  const tpl = getTemplate(type ?? "aller");
  const headings = new Map<string, Target>();
  for (const s of tpl.sections) {
    // section à un seul champ → ce champ ; plusieurs champs (Plan d'action) → le premier champ de liste
    // par défaut, remplacé dès qu'un sous-titre (« Études : », « Réalisation : ») est rencontré
    const solo = s.fields.length === 1 ? s.fields[0] : s.fields.find((f) => f.kind === "list");
    for (const k of [s.title, ...(s.aliases ?? [])]) headings.set(normKey(k), { section: s, field: solo });
    for (const f of s.fields) {
      if (f.kind === "role") continue;
      for (const k of [f.label, ...(f.aliases ?? [])]) if (!headings.has(normKey(k))) headings.set(normKey(k), { section: s, field: f });
    }
  }
  const lookup = (text: string, fuzzy: boolean): Target | undefined => {
    const k = normKey(text.replace(ROMAN_PREFIX, "").replace(/[:.]\s*$/, ""));
    if (!k) return undefined;
    const exact = headings.get(k);
    if (exact || !fuzzy) return exact;
    return [...headings.entries()].find(([key]) => key.length > 4 && (k.startsWith(key) || key.startsWith(k)))?.[1];
  };

  const content = emptyContent(tpl);
  const lists = new Map<string, DraftItem[]>();
  const texts = new Map<string, string[]>();
  const unmatched: string[] = [];
  let current: Target | undefined;

  /** Dernier élément du champ courant, si ce champ accepte du contenu riche. */
  const richTarget = (): DraftItem | undefined => {
    const f = current?.field;
    if (!f || f.kind !== "list" || !f.rich) return undefined;
    const l = lists.get(f.key);
    return l?.[l.length - 1];
  };
  const imageBlock = (ids: string[], captions: string[] = [], columns = 1): RichBlock | null => {
    const imgs = ids.map((rid, i) => ({ assetId: images.get(rid) ?? "", caption: captions[i] ?? "" })).filter((im) => im.assetId);
    return imgs.length ? { id: newId(), type: "images", columns: Math.max(1, Math.min(3, columns)), images: imgs } : null;
  };

  const handlePara = (p: RawPara, idx: number, all: Node[]) => {
    // images seules dans un paragraphe → bloc image de l'élément courant
    if (p.images.length) {
      const target = richTarget();
      const next = all[idx + 1];
      const cap = next && next.kind === "p" && next.caption && !next.images.length ? next.text : "";
      const block = imageBlock(p.images, cap ? [cap] : []);
      if (target && block) target.blocks.push(block);
      if (!p.text) return;
    }
    if (isTitle(p.style) || !p.text) return;
    if (p.caption && idx > 0) {
      const prev = all[idx - 1];
      if (prev.kind === "p" && prev.images.length) return; // déjà utilisée comme légende
    }
    if (/^prosit(aller|retour)$/.test(normKey(p.text)) || /^boucle\s+pbl/i.test(p.text)) return;
    // légende des statuts (« ✔ Validée ◐ Partiellement validée ✘ Non validée ») : pas un élément
    if (/partiellementvalidee.*nonvalidee/.test(normKey(p.text))) return;

    // Titres : style Word, ou paragraphe court reconnu (format tableau / texte libre)
    if (isHeadingStyle(p.style)) {
      const t = lookup(p.text, true);
      if (t) current = t;
      else {
        // un Titre 1 inconnu (ex. « Analyser le besoin ») ouvre une zone neutre
        if (/2$/.test(p.style)) unmatched.push(p.text);
        current = undefined;
      }
      return;
    }
    if (p.text.length <= 60 && !BULLET.test(p.text)) {
      const t = lookup(p.text, false);
      if (t) {
        current = t;
        return;
      }
    }
    if (!current) return;

    // Rôles : « Animateur : Alice »
    if (!current.field || current.field.kind === "role") {
      const m = /^(.+?)\s*:\s*(.*)$/.exec(p.text.replace(BULLET, ""));
      const role = m && current.section.fields.find((f) => f.kind === "role" && [f.label, ...(f.aliases ?? [])].some((l) => normKey(l) === normKey(m[1])));
      if (role && m) content[role.key] = m[2].trim();
      return;
    }

    const field = current.field;
    if (field.kind === "text") {
      texts.set(field.key, [...(texts.get(field.key) ?? []), p.text.replace(BULLET, "")]);
      return;
    }
    if (field.kind !== "list") return;

    const bullet = BULLET.exec(p.text);
    const manual = bullet ? null : (/^\s*\d+\s*[.)](?:\s+|(?=[^\d\s]))/.exec(p.text) ?? /^\s*[a-z]\s*[.)]\s+/i.exec(p.text));
    const isItem = p.numbered || !!bullet || isListStyle(p.style) || !!manual;
    const prevItem = richTarget();
    // Prosit retour : un paragraphe simple sous un élément est un paragraphe de cet élément
    if (!isItem && prevItem) {
      prevItem.blocks.push({ id: newId(), type: "text", text: p.text });
      return;
    }

    const prefix = bullet ?? (p.numbered ? null : manual);
    const text = prefix ? p.text.slice(prefix[0].length).trim() : p.text;
    if (!text) return;
    const item: DraftItem = { text, rawLevel: p.numbered ? p.ilvl : 0, blocks: [] };
    if (field.status) {
      // statut : symbole en tête, couleur / surlignage du texte
      const sym = (Object.keys(STATUS_META) as PisteStatus[]).find((st) => item.text.startsWith(STATUS_META[st].symbol));
      item.status = sym ?? statusFromColors(p.colors);
      if (sym) item.text = item.text.slice(STATUS_META[sym].symbol.length).trim();
    }
    if (field.detail) {
      // « élément : définition » (le « : » doit être entouré d'espaces, typographie française)
      const at = item.text.indexOf(" : ");
      if (at > 0) {
        item.detail = item.text.slice(at + 3).trim() || undefined;
        item.text = item.text.slice(0, at).trim();
      } else if (/\s:$/.test(item.text)) item.text = item.text.replace(/\s:$/, "").trim();
    }
    lists.set(field.key, [...(lists.get(field.key) ?? []), item]);
  };

  nodes.forEach((n, idx) => {
    if (n.kind === "p") return handlePara(n, idx, nodes);
    const hasImages = n.rows.some((r) => r.some((c) => c.images.length));
    const multiRow = n.rows.length > 1;
    // tableau de mise en page (titre de section, bandeau, bloc titre) : on lit ses paragraphes
    if (!hasImages && !multiRow) {
      n.paras.forEach((p, i) => handlePara(p, i, n.paras));
      return;
    }
    // tableau « Mot clé | Définition » (CER) sous une liste à définitions → un élément par ligne
    const f = current?.field;
    if (!hasImages && f?.kind === "list" && f.asTable && n.rows.every((r) => r.length === 2)) {
      const rows = [...n.rows];
      const head = normKey(rows[0][0].text);
      if (head === normKey(f.asTable[0]) || /^(motcle|motscles|terme|notion)$/.test(head)) rows.shift();
      const items = rows
        .filter((r) => r[0].text.trim())
        .map((r): DraftItem => ({ text: r[0].text.trim(), detail: r[1].text.trim() || undefined, rawLevel: 0, blocks: [] }));
      lists.set(f.key, [...(lists.get(f.key) ?? []), ...items]);
      return;
    }
    const target = richTarget();
    if (!target) return;
    if (hasImages) {
      const cells = n.rows.flat().filter((c) => c.images.length);
      const columns = Math.max(...n.rows.map((r) => r.filter((c) => c.images.length).length));
      const block = imageBlock(
        cells.map((c) => c.images[0]),
        cells.map((c) => c.text),
        columns,
      );
      if (block) target.blocks.push(block);
    } else {
      target.blocks.push({ id: newId(), type: "table", header: true, rows: n.rows.map((r) => r.map((c) => c.text)) });
    }
  });

  for (const f of allFields(tpl)) {
    if (f.kind === "text" && texts.has(f.key)) content[f.key] = texts.get(f.key)!.join("\n");
    if (f.kind === "list" && lists.has(f.key)) {
      const raw = lists.get(f.key)!;
      const min = Math.min(...raw.map((r) => r.rawLevel));
      const items: ListItem[] = raw.map((r) => ({
        id: newId(),
        text: r.text,
        level: Math.min(MAX_LEVEL, r.rawLevel - min),
        ...(r.detail ? { detail: r.detail } : {}),
        ...(r.status ? { status: r.status } : {}),
        ...(r.blocks.length ? { blocks: r.blocks } : {}),
      }));
      content[f.key] = normalizeList(items);
    }
  }

  return { type, meta, content, unmatched };
}

/** Enregistre une image extraite du .docx et renvoie son identifiant (fourni par l'appelant). */
export type ImageSaver = (data: Buffer) => string | null;

export async function importDocx(buf: ArrayBuffer | Buffer, forceType?: DocType, saveImage?: ImageSaver): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("Fichier .docx invalide : word/document.xml introuvable");

  const images = new Map<string, string>();
  if (saveImage) {
    const rels = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
    const targets = new Map(
      [...rels.matchAll(/<Relationship\b[^>]*>/g)]
        .map((m) => [/\bId="([^"]+)"/.exec(m[0])?.[1], /\bTarget="([^"]+)"/.exec(m[0])?.[1]] as const)
        .filter((e): e is readonly [string, string] => !!e[0] && !!e[1]),
    );
    for (const rid of new Set([...xml.matchAll(/<a:blip [^>]*?r:embed="([^"]+)"/g)].map((m) => m[1]))) {
      const target = targets.get(rid);
      if (!target) continue;
      const p = target.startsWith("/") ? target.slice(1) : `word/${target}`.replace(/word\/\.\.\//, "");
      const data = await zip.file(p)?.async("nodebuffer");
      const id = data ? saveImage(data) : null;
      if (id) images.set(rid, id);
    }
  }
  const stylesXml = (await zip.file("word/styles.xml")?.async("string")) ?? "";
  const styleNames = new Map<string, string>();
  for (const m of stylesXml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>[\s\S]*?<w:name w:val="([^"]+)"/g)) styleNames.set(m[1], m[2]);
  return importFromXml(xml, forceType, images, styleNames);
}
