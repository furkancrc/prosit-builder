import type { DocType, Meta, MetaPatch } from "./schema";

/** « Prosit aller SI - 1 » → « Prosit retour SI - 1 » (si le nom n'a pas été surchargé pour le retour). */
export function deriveNomForType(nom: string, type: DocType): string {
  if (type === "aller") return nom;
  if (/\baller\b/i.test(nom)) {
    return nom.replace(/\baller\b/i, (m) => (m[0] === m[0].toUpperCase() ? "Retour" : "retour"));
  }
  return nom;
}

/** Métadonnées effectives d'un document : celles du prosit, surchargées par celles du document (retour). */
export function effectiveMeta(base: Meta, type: DocType, overrides: MetaPatch | null | undefined): Meta {
  const derived: Meta = { ...base, nom: deriveNomForType(base.nom, type) };
  const o = overrides ?? {};
  const out = { ...derived };
  for (const k of Object.keys(o) as (keyof Meta)[]) {
    const v = o[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export function docTitle(meta: Meta, type: DocType): string {
  const t = type === "aller" ? "Aller" : "Retour";
  return meta.numero ? `Prosit ${t} n° ${meta.numero}` : `Prosit ${t}`;
}

export function formatDateFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Titre normalisé d'un prosit (paire aller + retour), affiché dans la liste et l'éditeur :
 * « Prosit 2 — SI et Sécurité ». Calculé à partir du numéro et du thème, jamais saisi à la main.
 */
export function prositTitle(p: Pick<Meta, "numero" | "theme">): { title: string; theme: string } {
  const numero = p.numero.trim();
  return { title: numero ? `Prosit ${numero}` : "Prosit sans numéro", theme: p.theme.trim() };
}

export function prositLabel(p: Pick<Meta, "numero" | "theme">): string {
  const { title, theme } = prositTitle(p);
  return theme ? `${title} — ${theme}` : title;
}

/** Tri des prosits d'une matière : par numéro croissant (1, 2, 10…), sans numéro à la fin, puis par date. */
export function compareProsits(a: Pick<Meta, "numero" | "date">, b: Pick<Meta, "numero" | "date">): number {
  const na = parseFloat(a.numero.replace(",", "."));
  const nb = parseFloat(b.numero.replace(",", "."));
  const ka = Number.isNaN(na) ? Infinity : na;
  const kb = Number.isNaN(nb) ? Infinity : nb;
  if (ka !== kb) return ka - kb;
  return (a.date || "").localeCompare(b.date || "");
}

/** Numéro de prosit tiré d'un nom de fichier : « Prosit_aller_SI_-_2.docx » → « 2 ». */
export function numeroFromFilename(name: string): string | undefined {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").trim();
  return /(?:n\s*[°º]\s*|prosit\s*|[-–]\s*)(\d{1,3})\s*$/i.exec(base)?.[1] ?? /(\d{1,3})\s*$/.exec(base)?.[1];
}
