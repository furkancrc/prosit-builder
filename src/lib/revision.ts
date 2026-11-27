import type { Content, ListItem, PisteStatus, Point, RichBlock } from "./schema";

/**
 * Mode révision : un paquet de cartes (recto = terme / question, verso = définition / réponse)
 * construit à partir du prosit retour. Une carte ratée repart en fin de paquet, jusqu'à ce que
 * toutes soient validées.
 */

export interface Card {
  /** `champ:idElément`, stable d'une séance à l'autre (progression enregistrée). */
  id: string;
  /** Clé de la catégorie (champ du gabarit). */
  deck: string;
  front: string;
  /** Lignes de texte du verso (définition, justification, description…). */
  back: string[];
  points?: Point[];
  etapes?: string[];
  interet?: string;
  status?: PisteStatus;
  blocks?: RichBlock[];
}

/** Rubriques qui donnent des cartes, avec l'intitulé de la catégorie et la consigne du recto. */
export const DECKS: { key: string; label: string; prompt: string }[] = [
  { key: "motsCles", label: "Mots clés", prompt: "Définir" },
  { key: "motsInconnus", label: "Mots inconnus", prompt: "Définir" },
  { key: "notions", label: "Notions", prompt: "Expliquer" },
  { key: "questions", label: "Questions du tuteur", prompt: "Répondre" },
  { key: "pistes", label: "Hypothèses", prompt: "Validée ou non ? Pourquoi ?" },
  { key: "contraintes", label: "Contraintes", prompt: "Expliquer" },
  { key: "etude", label: "Études", prompt: "Résumer" },
  { key: "realisation", label: "Réalisation", prompt: "Décrire la démarche" },
  { key: "objectifs", label: "AAV", prompt: "Ce que je sais faire" },
];

const lines = (s: string | undefined) => (s ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const hasBlocks = (b: RichBlock[] | undefined) =>
  !!b?.some((x) => (x.type === "text" ? x.text.trim() : x.type === "images" ? x.images.length : x.rows.some((r) => r.some((c) => c.trim()))));

function toCard(deck: string, it: ListItem): Card | null {
  const front = it.text.trim();
  if (!front) return null;
  const back = [...lines(it.description), ...lines(it.detail)];
  const points = it.points?.filter((p) => p.texte.trim() || p.label?.trim());
  const etapes = it.etapes?.filter((e) => e.trim());
  const interet = it.interet?.trim() || undefined;
  const blocks = hasBlocks(it.blocks) ? it.blocks : undefined;
  // une carte sans verso n'apprend rien (sauf une hypothèse tranchée : le statut est la réponse)
  if (!back.length && !points?.length && !etapes?.length && !interet && !blocks && !it.status) return null;
  return {
    id: `${deck}:${it.id}`,
    deck,
    front,
    back,
    ...(points?.length ? { points } : {}),
    ...(etapes?.length ? { etapes } : {}),
    ...(interet ? { interet } : {}),
    ...(it.status ? { status: it.status } : {}),
    ...(blocks ? { blocks } : {}),
  };
}

export function buildCards(content: Content): Card[] {
  return DECKS.flatMap(({ key }) => {
    const v = content[key];
    return Array.isArray(v) ? v.map((it) => toCard(key, it)).filter((c): c is Card => !!c) : [];
  });
}

// ---------- séance : file d'attente façon Quizlet ----------

export interface Session {
  /** Cartes restantes, la première est la carte affichée. */
  queue: string[];
  /** Cartes validées, dans l'ordre. */
  known: string[];
  /** Nombre d'erreurs par carte. */
  misses: Record<string, number>;
  /** Nombre de cartes au départ de la séance. */
  total: number;
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function startSession(ids: string[]): Session {
  return { queue: ids.slice(), known: [], misses: {}, total: ids.length };
}

/** « Je savais » : la carte sort du paquet. « À revoir » : elle repart en fin de paquet. */
export function answer(s: Session, knew: boolean): Session {
  const [head, ...rest] = s.queue;
  if (head === undefined) return s;
  if (knew) return { ...s, queue: rest, known: [...s.known, head] };
  return { ...s, queue: [...rest, head], misses: { ...s.misses, [head]: (s.misses[head] ?? 0) + 1 } };
}

/** Ne garde que les cartes qui existent encore (le prosit a pu changer depuis la dernière séance). */
export function reconcile(s: Session, ids: string[]): Session | null {
  const exists = new Set(ids);
  const queue = s.queue.filter((id) => exists.has(id));
  const known = s.known.filter((id) => exists.has(id));
  if (!queue.length && !known.length) return null;
  return { ...s, queue, known, total: queue.length + known.length };
}
