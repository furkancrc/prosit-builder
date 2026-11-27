import { sameItem } from "./templates";
import { STATUS_META, type PisteStatus } from "./schema";
import { shuffle, type Card } from "./revision";

/**
 * QCM générés à partir des cartes de révision, sans IA : les mauvaises réponses sont les
 * définitions / réponses / étapes des autres éléments du prosit.
 */

export interface QuizOption {
  text: string;
  correct: boolean;
}

export interface Question {
  id: string;
  /** Paquet d'origine (filtre « Mots clés », « Hypothèses »…). */
  deck: string;
  /** « single » : une seule bonne réponse ; « multiple » : une ou plusieurs. */
  kind: "single" | "multiple";
  prompt: string;
  /** Texte cité sous la question (terme, définition, hypothèse). */
  subject?: string;
  options: QuizOption[];
  /** Rappel affiché après la réponse. */
  explain?: string;
}

type Rand = () => number;

const MAX_OPTION = 260;
const clip = (s: string) => (s.length > MAX_OPTION ? `${s.slice(0, MAX_OPTION - 1).trimEnd()}…` : s);

/** Réponse d'une carte en une ligne (définition, réponse, description…). */
export function answerText(c: Card): string {
  if (c.back.length) return c.back.join(" ");
  if (c.points?.length) return c.points.map((p) => (p.label ? `${p.label} : ${p.texte}` : p.texte)).join(" ; ");
  if (c.etapes?.length) return c.etapes.join(" ; ");
  return c.interet ?? "";
}

/** Retire les doublons (même texte à la casse et aux accents près), la bonne réponse gagne. */
function dedupe(options: QuizOption[]): QuizOption[] {
  const out: QuizOption[] = [];
  for (const o of [...options.filter((o) => o.correct), ...options.filter((o) => !o.correct)]) {
    if (o.text.trim() && !out.some((x) => sameItem(x.text, o.text))) out.push(o);
  }
  return out;
}

function pick<T>(arr: T[], n: number, rand: Rand): T[] {
  return shuffle(arr, rand).slice(0, n);
}

/** QCM à une réponse : la bonne + jusqu'à 3 intrus pris dans `pool`. Null s'il n'y a pas assez d'intrus. */
function single(base: Omit<Question, "kind" | "options">, good: string, pool: string[], rand: Rand): Question | null {
  const wrong = pick(pool.filter((p) => !sameItem(p, good)), 6, rand);
  const options = dedupe([{ text: clip(good), correct: true }, ...wrong.map((w) => ({ text: clip(w), correct: false }))]).slice(0, 4);
  return options.length >= 3 ? { ...base, kind: "single", options: shuffle(options, rand) } : null;
}

const DEF_DECKS: Record<string, { what: string; reverse: string }> = {
  motsCles: { what: "Quelle est la définition de ce mot clé ?", reverse: "Quel mot clé correspond à cette définition ?" },
  motsInconnus: { what: "Quelle est la définition de ce mot ?", reverse: "Quel mot correspond à cette définition ?" },
  notions: { what: "Quelle explication correspond à cette notion ?", reverse: "Quelle notion correspond à cette explication ?" },
  contraintes: { what: "Quelle explication correspond à cette contrainte ?", reverse: "Quelle contrainte correspond à cette explication ?" },
};

const STATUSES: PisteStatus[] = ["valid", "partial", "invalid"];

export function buildQuiz(cards: Card[], rand: Rand = Math.random): Question[] {
  const out: Question[] = [];
  const push = (q: Question | null) => q && out.push(q);

  // ---- définitions : « quelle définition ? » ou, une fois sur deux, « quel terme ? » ----
  const defCards = cards.filter((c) => DEF_DECKS[c.deck] && c.back.length);
  for (const c of defCards) {
    // intrus : d'abord le même paquet, sinon les autres définitions
    const same = defCards.filter((d) => d.id !== c.id && d.deck === c.deck);
    const others = same.length >= 3 ? same : defCards.filter((d) => d.id !== c.id);
    const def = answerText(c);
    const reverse = rand() < 0.5;
    push(
      reverse
        ? single({ id: `term:${c.id}`, deck: c.deck, prompt: DEF_DECKS[c.deck].reverse, subject: clip(def), explain: `${c.front} : ${def}` }, c.front, others.map((d) => d.front), rand)
        : single({ id: `def:${c.id}`, deck: c.deck, prompt: DEF_DECKS[c.deck].what, subject: c.front, explain: `${c.front} : ${def}` }, def, others.map(answerText), rand),
    );
  }

  // ---- questions du tuteur : la bonne réponse parmi celles des autres questions et notions ----
  const answered = cards.filter((c) => (c.deck === "questions" || c.deck === "notions") && answerText(c));
  for (const c of cards.filter((c) => c.deck === "questions" && answerText(c))) {
    push(single({ id: `q:${c.id}`, deck: c.deck, prompt: c.front, explain: answerText(c) }, answerText(c), answered.filter((d) => d.id !== c.id).map(answerText), rand));
  }

  // ---- hypothèses : statut de chacune, puis « lesquelles ont été validées ? » par groupe de 4 ----
  const pistes = cards.filter((c) => c.deck === "pistes" && c.status);
  for (const c of pistes) {
    out.push({
      id: `status:${c.id}`,
      deck: c.deck,
      kind: "single",
      prompt: "Cette hypothèse a-t-elle été validée ?",
      subject: c.front,
      options: STATUSES.map((s) => ({ text: STATUS_META[s].label, correct: s === c.status })),
      explain: c.back.join(" ") || undefined,
    });
  }
  if (pistes.length >= 4 && new Set(pistes.map((p) => p.status)).size > 1) {
    const order = shuffle(pistes, rand);
    for (let i = 0; i < order.length; i += 4) {
      let group = order.slice(i, i + 4);
      if (group.length < 4) group = [...group, ...pick(order.slice(0, i), 4 - group.length, rand)];
      const target: PisteStatus = group.some((p) => p.status === "valid") ? "valid" : "invalid";
      if (!group.some((p) => p.status === target)) continue;
      out.push({
        id: `pistes:${group.map((p) => p.id).join("+")}`,
        deck: "pistes",
        kind: "multiple",
        prompt: target === "valid" ? "Lesquelles de ces hypothèses ont été validées ?" : "Lesquelles de ces hypothèses n’ont pas été validées ?",
        options: shuffle(group.map((p) => ({ text: clip(p.front), correct: p.status === target })), rand),
        explain: group.map((p) => `${STATUS_META[p.status!].symbol} ${p.front}`).join("\n"),
      });
    }
  }

  // ---- plan d'action : « comment faire X ? » → ses étapes / points parmi ceux des autres éléments ----
  const steps = (c: Card) => c.etapes ?? c.points?.filter((p) => p.texte.trim()).map((p) => (p.label ? `${p.label} : ${p.texte}` : p.texte)) ?? [];
  const plan = cards.filter((c) => c.deck === "etude" || c.deck === "realisation");
  for (const c of plan) {
    const own = steps(c);
    const foreign = plan.filter((d) => d.id !== c.id).flatMap(steps).filter((s) => !own.some((o) => sameItem(o, s)));
    if (own.length >= 2 && foreign.length >= 1) {
      // 1 à 3 bonnes réponses (au hasard), complétées par des intrus jusqu'à 4 propositions
      const maxGood = Math.min(3, own.length);
      const minGood = Math.min(maxGood, Math.max(1, 4 - foreign.length));
      const good = pick(own, minGood + Math.floor(rand() * (maxGood - minGood + 1)), rand);
      const options = dedupe([...good.map((t) => ({ text: clip(t), correct: true })), ...pick(foreign, 4 - good.length, rand).map((t) => ({ text: clip(t), correct: false }))]);
      if (options.length >= 3)
        out.push({
          id: `plan:${c.id}`,
          deck: c.deck,
          kind: "multiple",
          prompt: c.deck === "realisation" ? "Comment s’y prendre ? Quelles étapes en font partie ?" : "Quels points font partie de cette étude ?",
          subject: c.front,
          options: shuffle(options, rand),
          explain: own.map((s, i) => (c.etapes ? `${i + 1}. ${s}` : `• ${s}`)).join("\n"),
        });
    }
    if (c.interet) {
      const pool = plan.filter((d) => d.id !== c.id && d.interet).map((d) => d.interet!);
      push(single({ id: `interet:${c.id}`, deck: c.deck, prompt: "Quel est l’intérêt de cet élément du plan d’action ?", subject: c.front, explain: c.interet }, c.interet, pool, rand));
    }
  }

  return out;
}

/** Bonne réponse : exactement les options correctes cochées. */
export function isRight(q: Question, chosen: number[]): boolean {
  const set = new Set(chosen);
  return q.options.every((o, i) => o.correct === set.has(i));
}

/** Empreinte des cartes : les QCM enregistrés sont régénérés si le prosit a changé. */
export function quizSignature(cards: Card[]): string {
  let h = 0;
  for (const ch of JSON.stringify(cards)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return `${cards.length}:${h >>> 0}`;
}
