import type { ListItem, Point } from "../schema";
import { cleanText, SIMILAR, similarity } from "./text";

/** Élément structuré du plan d'action. */
export interface ElementPlan {
  titre: string;
  description?: string;
  points?: Point[];
  etapes?: string[];
  interet?: string;
}

const BULLET = /^\s*(?:[-•*–—▪◦■o])\s+/;
const NUMBER = /^\s*\d{1,2}\s*[.)]\s*/;
const INTERET = /^\s*(?:(?:avantage|avantages|intérêt|interet|intérêts|bénéfice|bénéfices)\s*:\s*|→\s*)/i;

/** Parenthèses et crochets équilibrés (sinon le « : » est à l'intérieur d'une parenthèse). */
function balanced(s: string): boolean {
  let depth = 0;
  for (const c of s) {
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/**
 * Sous-puce « label : texte » : le label (1 à 6 mots, 40 caractères au plus, parenthèses fermées)
 * devient un libellé en gras ; sinon toute la ligne reste du texte normal.
 */
export function parsePoint(raw: string): Point {
  const line = raw.replace(/^\*\*([^*]+)\*\*\s*:/, "$1 :");
  const m = /^(.{1,40}?)\s*:\s+(.+)$/.exec(line.trim());
  if (m) {
    const label = cleanText(m[1]);
    const words = label.split(/\s+/).filter(Boolean).length;
    if (words >= 1 && words <= 6 && balanced(label)) return { label, texte: cleanText(m[2]) };
  }
  return { texte: cleanText(line) };
}

/**
 * Texte libre → élément du plan d'action (migration, collage, repli si la réponse IA n'est pas du JSON valide).
 * 1re ligne = titre ; ligne sans marqueur juste après = description ; « - / • / * / – » = points ;
 * « 1. / 2) » = étapes ; « Avantage : / Intérêt : / → » = intérêt.
 */
export function parsePlanText(text: string): ElementPlan {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  const el: ElementPlan = { titre: "" };
  if (!lines.length) return el;
  el.titre = cleanText(lines[0].replace(BULLET, "").replace(NUMBER, ""));
  const description: string[] = [];
  const points: Point[] = [];
  const etapes: string[] = [];
  let last: "description" | "points" | "etapes" | "interet" | null = null;
  for (const raw of lines.slice(1)) {
    const l = raw.trim();
    if (INTERET.test(l)) {
      el.interet = cleanText(l.replace(INTERET, ""));
      last = "interet";
    } else if (NUMBER.test(l)) {
      etapes.push(cleanText(l.replace(NUMBER, "")));
      last = "etapes";
    } else if (BULLET.test(l)) {
      points.push(parsePoint(l.replace(BULLET, "")));
      last = "points";
    } else if (last === "points" && points.length) {
      // ligne sans puce juste après une puce : suite de cette puce
      const p = points[points.length - 1];
      p.texte = cleanText(`${p.texte} ${l}`);
    } else if (last === "etapes" && etapes.length) {
      etapes[etapes.length - 1] = cleanText(`${etapes[etapes.length - 1]} ${l}`);
    } else if (last === "interet" && el.interet) {
      el.interet = cleanText(`${el.interet} ${l}`);
    } else {
      description.push(l);
      last = "description";
    }
  }
  if (description.length) el.description = cleanText(description.join(" "));
  if (points.length) el.points = points;
  if (etapes.length) el.etapes = etapes;
  return el;
}

/** L'élément a-t-il un contenu sous son titre ? */
export function hasPlanContent(i: ListItem): boolean {
  return !!(i.description?.trim() || i.points?.length || i.etapes?.length || i.interet?.trim() || i.detail?.trim() || i.blocks?.length);
}

function cleanPoints(points: Point[] | undefined): Point[] | undefined {
  const out = (points ?? [])
    .map((p) => {
      // un point sans label dont le texte est « label : texte » est re-découpé
      const q = p.label?.trim() ? { label: cleanText(p.label), texte: cleanText(p.texte) } : parsePoint(p.texte);
      return q.label ? q : { texte: q.texte };
    })
    .filter((p) => p.texte || p.label);
  return out.length ? out : undefined;
}

const clean = (s: string | undefined) => {
  const t = s ? cleanText(s.replace(/\s*\n\s*/g, " ")) : "";
  return t || undefined;
};

/**
 * Met en forme une liste du plan d'action (Études ou Réalisation) :
 * - ancien texte libre (`detail` multi-lignes, ou titre contenant des retours à la ligne) → champs structurés ;
 * - sous-éléments (niveau ≥ 1) → points (Études) ou étapes (Réalisation) de l'élément parent ;
 * - élément vide dont le titre ressemble à un élément rempli → supprimé ; élément sans titre ni contenu → supprimé.
 */
export function formatPlanList(items: ListItem[], kind: "etude" | "realisation"): ListItem[] {
  const out: ListItem[] = [];
  for (const it of items) {
    const parent = out[out.length - 1];
    if (it.level > 0 && parent) {
      // sous-élément → partie structurée de l'élément parent
      const text = cleanText(it.text);
      const detail = it.detail?.trim() ? cleanText(it.detail.replace(/\s*\n\s*/g, " ")) : "";
      if (kind === "realisation") {
        parent.etapes = [...(parent.etapes ?? []), detail ? `${text} : ${detail}` : text].filter(Boolean);
      } else if (text || detail) {
        const p: Point = detail ? (text.split(/\s+/).length <= 6 ? { label: text, texte: detail } : { texte: `${text} : ${detail}` }) : parsePoint(text);
        parent.points = [...(parent.points ?? []), p];
      }
      continue;
    }

    const el: ListItem = { ...it, level: 0 };
    const raw = [it.text, it.detail ?? ""].join("\n");
    if (raw.includes("\n") && (it.text.includes("\n") || it.detail?.trim())) {
      // migration : texte libre → structure (sans écraser les champs déjà structurés)
      const parsed = parsePlanText(raw);
      el.text = parsed.titre;
      el.description = el.description?.trim() ? el.description : parsed.description;
      el.points = el.points?.length ? el.points : parsed.points;
      el.etapes = el.etapes?.length ? el.etapes : parsed.etapes;
      el.interet = el.interet?.trim() ? el.interet : parsed.interet;
      delete el.detail;
    } else {
      el.text = cleanText(it.text);
    }
    el.description = clean(el.description);
    el.interet = clean(el.interet?.replace(INTERET, ""));
    el.points = cleanPoints(el.points);
    const etapes = (el.etapes ?? []).map((e) => cleanText(e.replace(NUMBER, "").replace(/\s*\n\s*/g, " "))).filter(Boolean);
    el.etapes = etapes.length ? etapes : undefined;
    for (const k of ["description", "points", "etapes", "interet"] as const) if (el[k] === undefined) delete el[k];
    out.push(el);
  }

  // éléments vides : supprimés s'ils n'ont pas de titre, ou si un élément rempli porte un titre semblable
  return out.filter((el, i) => {
    if (hasPlanContent(el)) return true;
    if (!el.text.trim()) return false;
    return !out.some((o, j) => j !== i && hasPlanContent(o) && similarity(o.text, el.text) >= SIMILAR);
  });
}
