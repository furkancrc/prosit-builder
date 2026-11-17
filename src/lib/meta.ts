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
