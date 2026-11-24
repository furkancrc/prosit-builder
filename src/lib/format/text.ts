/**
 * Nettoyage de texte déterministe (aucun appel réseau ni IA) : même entrée → même sortie.
 */

/** Espaces : tabulations et espaces multiples réduits, bords retirés. Les espaces insécables (U+00A0, U+202F) sont conservés. */
export function normalizeSpaces(s: string): string {
  return s
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/ +([,.)])/g, "$1")
    .replace(/\( +/g, "(")
    .trim();
}

/** Retire le markdown (gras, italique souligné, titres, code) et les références de citation [1], [2][3], [1, 2]. */
export function stripMarkdown(s: string, opts: { keepBold?: boolean } = {}): string {
  let out = s
    .replace(/\s?\[\d+(?:\s*[,–-]\s*\d+)*\](?:\[\d+\])*/g, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/`+([^`]*)`+/g, "$1")
    .replace(/__([^_]+)__/g, "$1");
  if (!opts.keepBold) out = out.replace(/\*\*([^*]*)\*\*/g, "$1").replace(/\*\*/g, "");
  return out;
}

/** Début de phrase sans accent → forme accentuée (petite table fermée, pour rester prévisible). */
const ACCENTS: [RegExp, string][] = [
  [/^Etudes\b/, "Études"],
  [/^Etudier\b/, "Étudier"],
  [/^Etude\b/, "Étude"],
  [/^Etablir\b/, "Établir"],
  [/^Etat\b/, "État"],
  [/^Etats\b/, "États"],
  [/^Elaborer\b/, "Élaborer"],
  [/^Evaluer\b/, "Évaluer"],
  [/^Eviter\b/, "Éviter"],
  [/^Ecrire\b/, "Écrire"],
  [/^Equipement\b/, "Équipement"],
  [/^Equipements\b/, "Équipements"],
  [/^Egalement\b/, "Également"],
  // verbes courants des plans d'action tapés sans accent
  [/^Definir\b/, "Définir"],
  [/^Developper\b/, "Développer"],
  [/^Deployer\b/, "Déployer"],
  [/^Decrire\b/, "Décrire"],
  [/^Decouvrir\b/, "Découvrir"],
  [/^Creer\b/, "Créer"],
  [/^Generer\b/, "Générer"],
  [/^Gerer\b/, "Gérer"],
  [/^Realiser\b/, "Réaliser"],
  [/^Rediger\b/, "Rédiger"],
  [/^Securiser\b/, "Sécuriser"],
  [/^Verifier\b/, "Vérifier"],
  [/^Repondre\b/, "Répondre"],
  [/^Reflechir\b/, "Réfléchir"],
  [/^Prevoir\b/, "Prévoir"],
  [/^Preparer\b/, "Préparer"],
  [/^Presenter\b/, "Présenter"],
  [/^A cause\b/, "À cause"],
  [/^A partir\b/, "À partir"],
  [/^A noter\b/, "À noter"],
];

/** Majuscule en début de texte et accents courants en début de phrase. */
export function fixCapitals(s: string): string {
  if (!s) return s;
  const capFirst = (t: string) => {
    const i = t.search(/\p{L}/u);
    if (i < 0) return t;
    // on ne touche pas à un mot qui commence par une minuscule suivie d'une majuscule (iPhone, eBay)
    if (/\p{Ll}\p{Lu}/u.test(t.slice(i, i + 2))) return t;
    return t.slice(0, i) + t[i].toUpperCase() + t.slice(i + 1);
  };
  const accents = (t: string) => {
    for (const [re, to] of ACCENTS) t = t.replace(re, to);
    return t;
  };
  // Majuscule seulement en début de texte (après un « . », on peut être au milieu de « S.I. est ») ;
  // la table d'accents, qui ne vise que des mots déjà en majuscule, s'applique aussi en début de phrase.
  return accents(capFirst(s)).replace(/([.!?]\s+)(\p{Lu}[^.!?]*)/gu, (_, sep: string, rest: string) => sep + accents(rest));
}

/** Nettoyage complet d'un texte d'une ligne. */
export function cleanText(s: string, opts: { keepBold?: boolean } = {}): string {
  return fixCapitals(normalizeSpaces(stripMarkdown(s, opts)));
}

/** Nettoyage d'un texte multi-lignes : chaque ligne nettoyée, lignes vides consécutives réduites à une, bords retirés. */
export function cleanMultiline(s: string, opts: { keepBold?: boolean } = {}): string {
  const lines = s.split(/\r?\n/).map((l) => (l.trim() ? cleanText(l, opts) : ""));
  const out: string[] = [];
  for (const l of lines) if (l || (out.length && out[out.length - 1] !== "")) out.push(l);
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

const STOPWORDS = new Set(
  "le la les l un une des de du d et ou a au aux en pour par sur dans avec sans ce ces cet cette qui que qu est sont se s sa son ses leur leurs ne pas plus il elle on nous vous ils elles y the of and to".split(" "),
);

/** Mots significatifs : minuscules, sans accents, sans ponctuation, sans mots vides. */
export function keyWords(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w));
}

/** Clé de comparaison stricte : texte normalisé (mots vides compris). */
export function textKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Similarité entre deux textes (0..1) : Jaccard sur les mots significatifs, ou recouvrement
 * (mots communs / plus petit ensemble) quand le plus court a au moins 3 mots — ce qui reconnaît
 * une reformulation qui ajoute une précision : « L'arbre correspond à l'AD » / « … (dossier = service) ».
 */
export function similarity(a: string, b: string): number {
  const wa = keyWords(a);
  const wb = keyWords(b);
  // faute de frappe : mêmes mots à une lettre près (« droits NFS » / « droits NTFS »), mais pas
  // « DHCP » / « DNS » (2 lettres d'écart) ni « Prosit 1 » / « Prosit 2 » (mots trop courts)
  if (wa.length >= 2 && wa.length === wb.length && wa.some((w, i) => w !== wb[i])) {
    const typo = wa.every((w, i) => w === wb[i] || (Math.min(w.length, wb[i].length) >= 3 && editDistance(w, wb[i]) <= 1));
    if (typo) return 0.9;
  }
  const A = new Set(wa);
  const B = new Set(wb);
  if (!A.size || !B.size) return textKey(a) === textKey(b) && textKey(a) !== "" ? 1 : 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  const jaccard = common / (A.size + B.size - common);
  const smaller = Math.min(A.size, B.size);
  const overlap = smaller >= 3 ? common / smaller : 0;
  return Math.max(jaccard, overlap);
}

export const SIMILAR = 0.8;

/** Distance d'édition (Levenshtein) entre deux mots courts. */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}
