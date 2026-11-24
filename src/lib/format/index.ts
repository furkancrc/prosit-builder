import type { Content, DocType, ListItem } from "../schema";
import { ALLER_TEMPLATE, RETOUR_TEMPLATE, allFields, coerceContent, getTemplate } from "../templates";
import { formatHypotheses } from "./hypotheses";
import { formatPlanList, parsePoint } from "./plan";
import { cleanMultiline, cleanText, normalizeSpaces, textKey } from "./text";

export { parsePlanText, parsePoint, formatPlanList, hasPlanContent, type ElementPlan } from "./plan";
export { formatHypotheses } from "./hypotheses";
export { cleanText, similarity, stripMarkdown, fixCapitals, normalizeSpaces } from "./text";

/** Champs où le **gras** en ligne est une fonctionnalité voulue (texte de synthèse rédigé à la main). */
const KEEP_BOLD = new Set(["syntheseIntro"]);

/**
 * Titres de rubrique connus (sections, regroupements des styles Classique / Rapport, sous-titres) :
 * un paragraphe qui n'est qu'un de ces titres est un reste d'import (ex. « Analyser le besoin. »).
 */
const STRONG_TITLES = new Set(
  [
    ...[ALLER_TEMPLATE, RETOUR_TEMPLATE].flatMap((t) => t.sections.map((s) => s.title)),
    "Prendre connaissance de la situation et clarifier",
    "Analyser le besoin",
    "Recherche des pistes de solution",
    "Prosit aller",
    "Prosit retour",
    "Prosit retour / CER",
  ].map((t) => textKey(t)),
);
/** Libellés et alias : ne comptent comme titre que s'ils en ont la forme (numérotés, ou finis par « . » / « : »). */
const WEAK_TITLES = new Set(
  [...[ALLER_TEMPLATE, RETOUR_TEMPLATE].flatMap((t) => t.sections.flatMap((s) => [...(s.aliases ?? []), ...s.fields.map((f) => f.label)])), "Problème"].map((t) =>
    textKey(t),
  ),
);

/** Ligne qui n'est qu'un titre de rubrique (éventuellement numéroté « II. » / « 1) » et terminé par « . » ou « : »). */
export function isTitleLine(line: string, opts: { strict?: boolean } = {}): boolean {
  const numbered = /^\s*(?:[IVXLC]+|\d+)\s*[.)]?\s+/.test(line);
  const punctuated = /[.:]\s*$/.test(line);
  const k = textKey(line.replace(/^\s*(?:[IVXLC]+|\d+)\s*[.)]?\s+/, "").replace(/[.:]\s*$/, ""));
  if (!k) return false;
  // strict (éléments de liste) : un mot clé « Contexte » reste un mot clé, seul « Contexte : » / « II. Contexte » est un titre
  if (opts.strict && !numbered && !punctuated) return false;
  return STRONG_TITLES.has(k) || ((numbered || punctuated) && WEAK_TITLES.has(k));
}

function formatTextField(v: string, keepBold: boolean): string {
  const lines = v.split(/\r?\n/).filter((l) => !isTitleLine(l));
  return cleanMultiline(lines.join("\n"), { keepBold });
}

function formatPlainList(items: ListItem[], withDetail: boolean): ListItem[] {
  return items
    .filter((i) => !(isTitleLine(i.text, { strict: true }) && !i.detail?.trim() && !i.blocks?.length))
    .map((i) => {
      const out: ListItem = { ...i };
      out.text = cleanText(i.text.replace(/\s*\n\s*/g, " "));
      if (i.detail !== undefined) {
        const d = cleanMultiline(i.detail);
        if (d) out.detail = d;
        else delete out.detail;
      }
      // champ à définitions : « terme : définition » tapé dans le texte → séparé (terme court uniquement)
      if (withDetail && !out.detail) {
        const p = parsePoint(out.text);
        if (p.label) {
          out.text = p.label;
          out.detail = p.texte;
        }
      }
      return out;
    })
    .filter((i) => i.text || i.detail || i.blocks?.length);
}

/**
 * Formateur déterministe d'un prosit (aller ou retour) : fonction pure, sans réseau ni IA.
 * Même entrée → même sortie ; appliquer deux fois ne change plus rien (idempotent).
 */
export function formatProsit(content: Content, type: DocType): Content {
  const tpl = getTemplate(type);
  const out = coerceContent(tpl, content);
  for (const f of allFields(tpl)) {
    const v = out[f.key];
    if (f.kind === "role") {
      out[f.key] = typeof v === "string" ? normalizeSpaces(v.replace(/\s*\n\s*/g, " ")) : "";
    } else if (f.kind === "text") {
      out[f.key] = typeof v === "string" ? formatTextField(v, KEEP_BOLD.has(f.key)) : "";
    } else if (Array.isArray(v)) {
      let items = v;
      if (f.plan) items = formatPlanList(items, f.key === "realisation" ? "realisation" : "etude");
      else if (f.status) items = formatHypotheses(formatPlainList(items, false));
      else items = formatPlainList(items, !!f.detail);
      out[f.key] = items;
    }
  }
  return out;
}

/** Nombre de rubriques modifiées par la mise en forme (pour le message affiché). */
export function countChanges(before: Content, after: Content): number {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  let n = 0;
  for (const k of keys) if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) n++;
  return n;
}
