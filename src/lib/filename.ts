import type { DocType, Meta } from "./schema";

const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/g;

/** Supprime accents et caractères interdits ; espaces → « _ ». Garde lettres, chiffres, « - », « _ », « . ». */
export function sanitizeFilename(input: string): string {
  let s = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[œ]/g, "oe")
    .replace(/[Œ]/g, "OE")
    .replace(/[æ]/g, "ae")
    .replace(/[Æ]/g, "AE")
    .replace(FORBIDDEN, " ")
    .replace(/'/g, "")
    .replace(/[^A-Za-z0-9 ._-]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.\s-]+|[_.\s]+$/g, "");
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = `_${s}`;
  return s.slice(0, 150) || "prosit";
}

/** Partie courte du thème : « SI : Administration et Sécurité » → « SI ». */
export function shortTheme(theme: string): string {
  const head = theme.split(/[:–—]| - /)[0]?.trim();
  return head || theme.trim();
}

/**
 * Variables du gabarit :
 * {type} aller/retour · {Type} Aller/Retour · {theme} thème court (avant « : ») · {themeComplet}
 * {numero} · {nom} · {bloc} · {date} · {auteur} · {groupe}
 */
export function buildFilename(template: string, meta: Meta, type: DocType): string {
  const vars: Record<string, string> = {
    type,
    Type: type === "aller" ? "Aller" : "Retour",
    theme: shortTheme(meta.theme),
    themeComplet: meta.theme,
    numero: meta.numero,
    nom: meta.nom,
    bloc: meta.bloc,
    date: meta.date,
    auteur: meta.auteur,
    groupe: meta.groupe,
  };
  const filled = template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
  return sanitizeFilename(filled);
}

/** Nom final avec extension, à partir d'un nom saisi par l'utilisateur. */
export function withExtension(name: string, ext: "docx" | "pdf"): string {
  const base = sanitizeFilename(name.replace(/\.(docx|pdf)$/i, ""));
  return `${base}.${ext}`;
}
