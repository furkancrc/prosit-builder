"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { answer, DECKS, reconcile, shuffle, startSession, type Card, type Session } from "@/lib/revision";
import { buildQuiz, isRight, quizSignature, type Question } from "@/lib/quiz";
import { STATUS_META } from "@/lib/schema";
import { IconBack, IconReset, IconUndo } from "./icons";
import { BlocksView, Inline } from "./RichView";

type Mode = "cartes" | "qcm";

interface QuizState {
  /** Empreinte des cartes au moment de la génération (régénéré si le prosit a changé). */
  sig: string;
  questions: Question[];
  session: Session;
}

interface Saved {
  decks: string[];
  shuffled: boolean;
  session: Session;
  mode?: Mode;
  quiz?: QuizState | null;
}

const storageKey = (id: string) => `prosit-revision-${id}`;

function load(id: string): Saved | null {
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(id: string, s: Saved) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(s));
  } catch {
    /* stockage indisponible : la séance n'est simplement pas reprise */
  }
}

/**
 * Révision façon Quizlet, en deux modes :
 * - Cartes : un paquet à retourner. « Je savais » retire la carte, « À revoir » la renvoie en fin de paquet.
 * - QCM : 4 propositions, une ou plusieurs bonnes réponses ; une question ratée revient en fin de série.
 * Dans les deux cas on continue jusqu'à ce que tout soit validé. La séance est reprise à la prochaine visite.
 */
export function Revision({ prositId, title, cards }: { prositId: string; title: string; cards: Card[] }) {
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const available = useMemo(() => DECKS.filter((d) => cards.some((c) => c.deck === d.key)), [cards]);
  const sig = useMemo(() => quizSignature(cards), [cards]);

  const [mode, setMode] = useState<Mode>("cartes");
  const [decks, setDecks] = useState<string[]>(() => available.map((d) => d.key));
  const [shuffled, setShuffled] = useState(true);
  const [session, setSession] = useState<Session>(() => startSession(cards.map((c) => c.id)));
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [history, setHistory] = useState<Session[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [ready, setReady] = useState(false);
  /** Incrémenté à chaque réponse : la carte / question suivante est remontée à neuf. */
  const [turn, setTurn] = useState(0);

  const idsFor = useCallback(
    (ds: string[], mix: boolean) => {
      const ids = cards.filter((c) => ds.includes(c.deck)).map((c) => c.id);
      return mix ? shuffle(ids) : ids;
    },
    [cards],
  );

  /** Nouvelle série de QCM (les intrus sont pris dans tout le prosit, les questions dans les paquets choisis). */
  const newQuiz = useCallback(
    (ds: string[], mix: boolean, only?: { questions: Question[]; ids: string[] }): QuizState => {
      const questions = only?.questions ?? buildQuiz(cards);
      const ids = only?.ids ?? questions.filter((q) => ds.includes(q.deck)).map((q) => q.id);
      return { sig, questions, session: startSession(mix ? shuffle(ids) : ids) };
    },
    [cards, sig],
  );

  const restart = useCallback(
    (ds = decks, mix = shuffled, only?: string[]) => {
      if (mode === "qcm") setQuiz((q) => newQuiz(ds, mix, only && q ? { questions: q.questions, ids: only } : undefined));
      else setSession(startSession(only ? (mix ? shuffle(only) : only) : idsFor(ds, mix)));
      setHistory([]);
      setFlipped(false);
      setTurn((t) => t + 1);
    },
    [mode, decks, shuffled, idsFor, newQuiz],
  );

  // reprise de la séance précédente (après le rendu serveur, le stockage n'existe que dans le navigateur)
  useEffect(() => {
    const saved = load(prositId);
    const ids = cards.map((c) => c.id);
    const s = saved && reconcile(saved.session, ids);
    let ds = available.map((d) => d.key);
    if (saved) {
      const kept = saved.decks.filter((d) => available.some((a) => a.key === d));
      if (kept.length) ds = kept;
      setDecks(ds);
      setShuffled(saved.shuffled);
      if (saved.mode) setMode(saved.mode);
    }
    setSession(s || startSession(shuffle(ids)));
    // les QCM enregistrés ne sont repris que si le prosit n'a pas changé depuis
    setQuiz(saved?.quiz && saved.quiz.sig === sig ? saved.quiz : newQuiz(ds, saved?.shuffled ?? true));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prositId]);

  useEffect(() => {
    if (ready) save(prositId, { decks, shuffled, session, mode, quiz });
  }, [ready, prositId, decks, shuffled, session, mode, quiz]);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setHistory([]);
    setFlipped(false);
    setTurn((t) => t + 1);
  };

  // séance du mode affiché
  const qById = useMemo(() => new Map((quiz?.questions ?? []).map((q) => [q.id, q])), [quiz]);
  const active = mode === "qcm" ? (quiz?.session ?? startSession([])) : session;
  const setActive = (f: (s: Session) => Session) => (mode === "qcm" ? setQuiz((q) => (q ? { ...q, session: f(q.session) } : q)) : setSession(f));
  const label = (id: string) => (mode === "qcm" ? (qById.get(id)?.subject ?? qById.get(id)?.prompt) : byId.get(id)?.front) ?? "";
  const exists = (id: string) => (mode === "qcm" ? qById.has(id) : byId.has(id));

  const currentCard = mode === "cartes" && session.queue[0] ? byId.get(session.queue[0]) : undefined;
  const currentQuestion = mode === "qcm" && active.queue[0] ? qById.get(active.queue[0]) : undefined;
  const done = ready && active.total > 0 && active.queue.length === 0;
  const unit = mode === "qcm" ? { one: "question", many: "questions", f: "e" } : { one: "carte", many: "cartes", f: "e" };

  const respond = useCallback(
    (knew: boolean) => {
      if (!active.queue.length) return;
      setHistory((h) => [...h.slice(-49), active]);
      setActive((s) => answer(s, knew));
      setFlipped(false);
      setTurn((t) => t + 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, mode],
  );

  const undo = useCallback(() => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setActive(() => prev);
    setFlipped(mode === "cartes");
    setTurn((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, mode]);

  const toggleDeck = (key: string) => {
    const next = decks.includes(key) ? decks.filter((d) => d !== key) : [...decks, key];
    if (!next.length) return;
    setDecks(next);
    // les deux séances suivent le choix des paquets
    setSession(startSession(idsFor(next, shuffled)));
    setQuiz(newQuiz(next, shuffled));
    setHistory([]);
    setFlipped(false);
    setTurn((t) => t + 1);
  };

  // raccourcis du mode Cartes (le QCM a les siens)
  useEffect(() => {
    if (mode !== "cartes") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === " " || k === "Enter" || k === "ArrowUp" || k === "ArrowDown") setFlipped((f) => !f);
      else if ((k === "ArrowRight" || k === "2") && flipped) respond(true);
      else if ((k === "ArrowLeft" || k === "1") && flipped) respond(false);
      else if (k === "z" || k === "Z" || k === "Backspace") undo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, flipped, respond, undo]);

  const deckLabel = (key: string) => DECKS.find((d) => d.key === key);
  const missed = Object.keys(active.misses).filter(exists);
  const pct = active.total ? Math.round((active.known.length / active.total) * 100) : 0;
  const countIn = (key: string) => (mode === "qcm" ? (quiz?.questions ?? []).filter((q) => q.deck === key).length : cards.filter((c) => c.deck === key).length);
  const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:py-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/prosits/${prositId}?tab=retour`} className="btn btn-ghost btn-icon" aria-label="Retour à l’éditeur" title="Retour à l’éditeur">
          <IconBack />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Révision</p>
          <h1 className="title-cesi truncate text-xl sm:text-2xl">{title}</h1>
        </div>
        {cards.length > 0 && (
          <>
            <div className="flex rounded-sm border border-line bg-surface p-0.5 text-sm" role="tablist" aria-label="Mode de révision">
              {(["cartes", "qcm"] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  className={`rounded-[1px] px-3 py-1.5 font-medium ${mode === m ? "bg-accent text-accent-fg" : "text-muted hover:text-ink"}`}
                  onClick={() => switchMode(m)}
                >
                  {m === "cartes" ? "Cartes" : "QCM"}
                </button>
              ))}
            </div>
            <button className="btn" onClick={() => restart()} title={mode === "qcm" ? "Nouvelle série de QCM" : "Recommencer avec tout le paquet"}>
              <IconReset /> <span className="hidden sm:inline">Recommencer</span>
            </button>
          </>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="rounded-sm border border-line bg-surface p-6 text-sm">
          <p className="font-semibold">Aucune carte à réviser pour l’instant.</p>
          <p className="mt-2 text-muted">
            Les cartes et les QCM sont créés à partir du prosit retour : les <strong>mots clés</strong> avec leur définition, les <strong>notions</strong> de la synthèse, les{" "}
            <strong>questions du tuteur</strong> avec leur réponse, les <strong>hypothèses</strong> tranchées et le <strong>plan d’action</strong> détaillé.
          </p>
          <Link href={`/prosits/${prositId}?tab=retour`} className="btn btn-primary mt-4">
            Compléter le prosit retour
          </Link>
        </div>
      ) : (
        <>
          {/* paquets et options */}
          <div className="flex flex-wrap items-center gap-2">
            {available.map((d) => {
              const on = decks.includes(d.key);
              const n = countIn(d.key);
              return (
                <button
                  key={d.key}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? "border-ink bg-ink text-bg" : "border-line bg-surface text-muted hover:border-ink"} ${n === 0 ? "opacity-40" : ""}`}
                  onClick={() => toggleDeck(d.key)}
                  aria-pressed={on}
                  title={on ? "Retirer ce paquet de la séance" : "Ajouter ce paquet à la séance"}
                >
                  {d.label} <span className="opacity-60">{n}</span>
                </button>
              );
            })}
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={shuffled}
                onChange={(e) => {
                  setShuffled(e.target.checked);
                  restart(decks, e.target.checked);
                }}
              />
              Mélanger
            </label>
          </div>

          {mode === "qcm" && ready && active.total === 0 ? (
            <div className="rounded-sm border border-line bg-surface p-6 text-sm">
              <p className="font-semibold">Pas assez d’éléments pour faire des QCM dans ces paquets.</p>
              <p className="mt-2 text-muted">
                Il faut au moins 4 mots clés ou notions définis, 4 questions du tuteur avec leur réponse, des hypothèses tranchées, ou des éléments du plan d’action avec leurs étapes : les mauvaises réponses sont tirées des autres éléments du prosit.
              </p>
            </div>
          ) : (
            <>
              {/* progression */}
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted">
                  <span>
                    <strong className="text-ink tabular-nums">{active.known.length}</strong> / {active.total} validée{active.total > 1 ? "s" : ""}
                  </span>
                  <span className="tabular-nums">
                    {active.queue.length} restante{active.queue.length > 1 ? "s" : ""}
                    {missed.length > 0 && ` · ${missed.length} ratée${missed.length > 1 ? "s" : ""}`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
                </div>
              </div>

              {done ? (
                <div className="rounded-sm border border-line bg-surface p-6 text-center sm:p-10">
                  <p className="title-cesi text-3xl">
                    <span className="underline-accent">{mode === "qcm" ? "Série terminée" : "Paquet terminé"}</span>
                  </p>
                  <p className="mt-3 text-sm text-muted">
                    {plural(active.total, unit.one)} validée{active.total > 1 ? "s" : ""}
                    {missed.length ? ` · ${missed.length} ratée${missed.length > 1 ? "s" : ""} au moins une fois` : " du premier coup, sans erreur"}.
                  </p>
                  {missed.length > 0 && (
                    <ul className="mx-auto mt-5 max-w-md space-y-1 text-left text-sm">
                      {missed
                        .sort((a, b) => active.misses[b] - active.misses[a])
                        .slice(0, 8)
                        .map((id) => (
                          <li key={id} className="flex gap-3 border-b border-line py-1.5 last:border-0">
                            <span className="min-w-0 flex-1 truncate">
                              <Inline text={label(id)} />
                            </span>
                            <span className="shrink-0 tabular-nums text-muted">{active.misses[id]}×</span>
                          </li>
                        ))}
                    </ul>
                  )}
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {missed.length > 0 && (
                      <button className="btn btn-primary" onClick={() => restart(decks, shuffled, missed)}>
                        {missed.length > 1 ? `Revoir les ${missed.length} ${unit.many} ratées` : `Revoir la ${unit.one} ratée`}
                      </button>
                    )}
                    <button className="btn" onClick={() => restart()}>
                      <IconReset /> {mode === "qcm" ? "Nouvelle série" : "Tout recommencer"}
                    </button>
                  </div>
                </div>
              ) : currentCard ? (
                <>
                  <FlipCard key={`${currentCard.id}-${turn}`} card={currentCard} prompt={deckLabel(currentCard.deck)} misses={session.misses[currentCard.id] ?? 0} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />

                  <div className="flex items-center gap-2">
                    <button className="btn btn-ghost btn-icon" onClick={undo} disabled={!history.length} title="Annuler la dernière réponse (Z)" aria-label="Annuler la dernière réponse">
                      <IconUndo />
                    </button>
                    {flipped ? (
                      <div className="grid flex-1 grid-cols-2 gap-2">
                        <button className="btn justify-center border-danger py-3 text-danger hover:border-danger" onClick={() => respond(false)} title="La carte repart en fin de paquet (← ou 1)">
                          ✘ À revoir
                        </button>
                        <button className="btn justify-center border-[#2E7D32] py-3 font-semibold text-[#2E7D32] hover:border-[#2E7D32] dark:border-[#4ADE80] dark:text-[#4ADE80]" onClick={() => respond(true)} title="La carte sort du paquet (→ ou 2)">
                          ✔ Je savais
                        </button>
                      </div>
                    ) : (
                      <button className="btn btn-primary flex-1 justify-center py-3" onClick={() => setFlipped(true)} title="Espace">
                        Retourner la carte
                      </button>
                    )}
                  </div>
                  <p className="text-center text-xs text-muted">Espace : retourner · ← / 1 : à revoir · → / 2 : je savais · Z : annuler</p>
                </>
              ) : currentQuestion ? (
                <>
                  <QuizCard
                    key={`${currentQuestion.id}-${turn}`}
                    question={currentQuestion}
                    deck={deckLabel(currentQuestion.deck)?.label}
                    misses={active.misses[currentQuestion.id] ?? 0}
                    onNext={respond}
                    onUndo={history.length ? undo : undefined}
                  />
                  <p className="text-center text-xs text-muted">1 à 4 : choisir · Entrée : valider puis continuer · Z : annuler</p>
                </>
              ) : null}
            </>
          )}
        </>
      )}
    </main>
  );
}

/**
 * Une question de QCM. Une seule réponse : un clic valide. Plusieurs : on coche puis on valide.
 * Après validation, la correction s'affiche et « Continuer » passe à la suite (la question revient plus tard si elle est ratée).
 */
function QuizCard({
  question: q,
  deck,
  misses,
  onNext,
  onUndo,
}: {
  question: Question;
  deck?: string;
  misses: number;
  onNext: (right: boolean) => void;
  onUndo?: () => void;
}) {
  // ordre des propositions tiré à chaque passage (une question ratée ne revient pas à l'identique)
  const order = useMemo(() => shuffle(q.options.map((_, i) => i)), [q]);
  const [chosen, setChosen] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const right = submitted && isRight(q, chosen);
  const multiple = q.kind === "multiple";

  const choose = useCallback(
    (i: number) => {
      if (submitted) return;
      if (!multiple) {
        setChosen([i]);
        setSubmitted(true);
      } else setChosen((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));
    },
    [submitted, multiple],
  );

  const validate = useCallback(() => {
    if (submitted) onNext(isRight(q, chosen));
    else if (chosen.length) setSubmitted(true);
  }, [submitted, chosen, q, onNext]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= order.length) choose(order[n - 1]);
      else if (e.key === "Enter") validate();
      else if ((e.key === "z" || e.key === "Z") && onUndo) onUndo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, choose, validate, onUndo]);

  return (
    <div className="rounded-md border border-line bg-surface p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold uppercase tracking-wide">{deck}</span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${multiple ? "bg-accent text-accent-fg" : "bg-surface-2"}`}>{multiple ? "Plusieurs réponses possibles" : "Une seule réponse"}</span>
        {misses > 0 && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-danger">ratée {misses}×</span>}
      </div>

      <p className="mt-4 text-lg font-bold leading-snug sm:text-xl">
        <Inline text={q.prompt} />
      </p>
      {q.subject && (
        <p className="mt-2 border-l-4 border-accent pl-3 text-base leading-relaxed">
          <Inline text={q.subject} />
        </p>
      )}

      <ul className="mt-5 space-y-2">
        {order.map((i, pos) => {
          const o = q.options[i];
          const picked = chosen.includes(i);
          // après validation : bonne réponse en vert, mauvais choix en rouge, bonne réponse oubliée en pointillés
          const state = !submitted ? (picked ? "picked" : "idle") : o.correct ? (picked ? "good" : "missed") : picked ? "bad" : "idle";
          const cls = {
            idle: "border-line hover:border-ink",
            picked: "border-ink bg-surface-2",
            good: "border-[#2E7D32] bg-[#2E7D32]/10 dark:border-[#4ADE80] dark:bg-[#4ADE80]/10",
            missed: "border-dashed border-[#2E7D32] dark:border-[#4ADE80]",
            bad: "border-danger bg-danger/10",
          }[state];
          return (
            <li key={i}>
              <button
                type="button"
                className={`flex w-full items-start gap-3 rounded-sm border-2 px-3 py-2.5 text-left text-sm leading-snug transition-colors sm:text-base ${cls} ${submitted ? "cursor-default" : ""}`}
                onClick={() => choose(i)}
                aria-pressed={picked}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-[11px] font-bold ${multiple ? "rounded-[3px]" : "rounded-full"} ${picked ? "border-ink bg-ink text-bg" : "border-line text-muted"}`}
                >
                  {picked && multiple ? "✓" : pos + 1}
                </span>
                <span className="min-w-0 flex-1 break-words">
                  <Inline text={o.text} />
                </span>
                {submitted && (state === "good" || state === "missed") && <span className="shrink-0 font-bold text-[#2E7D32] dark:text-[#4ADE80]">✔</span>}
                {submitted && state === "bad" && <span className="shrink-0 font-bold text-danger">✘</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {submitted && (
        <div className={`mt-5 rounded-sm border-l-4 p-3 text-sm ${right ? "border-[#2E7D32] bg-[#2E7D32]/10 dark:border-[#4ADE80]" : "border-danger bg-danger/10"}`}>
          <p className="font-bold">{right ? "✔ Bonne réponse" : multiple ? "✘ Pas tout à fait : la question reviendra plus tard" : "✘ Raté : la question reviendra plus tard"}</p>
          {q.explain && (
            <p className="mt-1 whitespace-pre-line text-muted">
              <Inline text={q.explain} />
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button className="btn btn-ghost btn-icon" onClick={onUndo} disabled={!onUndo} title="Annuler la dernière réponse (Z)" aria-label="Annuler la dernière réponse">
          <IconUndo />
        </button>
        {submitted ? (
          <button className="btn btn-primary flex-1 justify-center py-3" onClick={validate} autoFocus>
            Continuer
          </button>
        ) : multiple ? (
          <button className="btn btn-primary flex-1 justify-center py-3" onClick={validate} disabled={!chosen.length}>
            Valider {chosen.length > 0 && `(${chosen.length})`}
          </button>
        ) : (
          <p className="flex-1 text-center text-sm text-muted">Clique sur la bonne réponse</p>
        )}
      </div>
    </div>
  );
}

function FlipCard({
  card,
  prompt,
  misses,
  flipped,
  onFlip,
}: {
  card: Card;
  prompt?: { label: string; prompt: string };
  misses: number;
  flipped: boolean;
  onFlip: () => void;
}) {
  // pas d'animation au premier affichage d'une carte (sinon on aperçoit le verso de la suivante)
  const mounted = useRef(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    mounted.current = true;
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const face = "col-start-1 row-start-1 flex min-h-[18rem] flex-col rounded-md border border-line bg-surface p-5 shadow-sm sm:min-h-[22rem] sm:p-8 [backface-visibility:hidden]";
  const header = (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span className="font-semibold uppercase tracking-wide">{prompt?.label}</span>
      {misses > 0 && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-danger">ratée {misses}×</span>}
    </div>
  );

  return (
    <div className="[perspective:1600px]">
      <div
        role="button"
        tabIndex={0}
        onClick={onFlip}
        aria-label={flipped ? "Voir le recto" : "Voir le verso"}
        className={`grid w-full cursor-pointer text-left [transform-style:preserve-3d] ${mounted.current ? "transition-transform duration-500" : ""}`}
        style={{ transform: flipped ? "rotateY(180deg)" : "none" }}
      >
        {/* recto */}
        <div className={face} aria-hidden={flipped}>
          {header}
          <div className="flex flex-1 items-center justify-center py-6 text-center">
            <p className="text-2xl font-bold leading-snug break-words sm:text-3xl">
              <Inline text={card.front} />
            </p>
          </div>
          <p className="text-center text-xs text-muted">{prompt?.prompt} · cliquer pour retourner</p>
        </div>

        {/* verso */}
        <div className={`${face} [transform:rotateY(180deg)]`} aria-hidden={!flipped}>
          {header}
          <p className="mt-2 text-sm font-semibold text-muted">
            <Inline text={card.front} />
          </p>
          <div className="mt-3 max-h-[60vh] flex-1 space-y-2 overflow-auto text-base leading-relaxed">
            {card.status && (
              <p>
                <span className="inline-block rounded-sm px-2 py-0.5 text-sm font-bold text-[#111]" style={{ background: STATUS_META[card.status].highlight }}>
                  {STATUS_META[card.status].symbol} {STATUS_META[card.status].label}
                </span>
              </p>
            )}
            {card.back.map((l, i) => (
              <p key={i}>
                <Inline text={l} />
              </p>
            ))}
            {card.points && (
              <ul className="space-y-1">
                {card.points.map((p, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted">•</span>
                    <span>
                      {p.label && <strong>{p.label}{p.texte.trim() ? " : " : ""}</strong>}
                      <Inline text={p.texte} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {card.etapes && (
              <ol className="space-y-1">
                {card.etapes.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-bold tabular-nums text-muted">{i + 1}.</span>
                    <Inline text={e} />
                  </li>
                ))}
              </ol>
            )}
            {card.blocks && <BlocksView blocks={card.blocks} dark={dark} />}
            {card.interet && (
              <p className="border-l-4 border-accent pl-3">
                <strong>Intérêt : </strong>
                <Inline text={card.interet} />
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
