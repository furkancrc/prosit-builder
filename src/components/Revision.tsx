"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { answer, DECKS, reconcile, shuffle, startSession, type Card, type Session } from "@/lib/revision";
import { STATUS_META } from "@/lib/schema";
import { IconBack, IconReset, IconUndo } from "./icons";
import { BlocksView, Inline } from "./RichView";

interface Saved {
  decks: string[];
  shuffled: boolean;
  session: Session;
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
 * Révision façon Quizlet : un paquet de cartes à retourner. « Je savais » retire la carte,
 * « À revoir » la renvoie en fin de paquet, jusqu'à ce que toutes soient validées.
 * La séance en cours est reprise à la prochaine visite (stockage du navigateur).
 */
export function Revision({ prositId, title, cards }: { prositId: string; title: string; cards: Card[] }) {
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const available = useMemo(() => DECKS.filter((d) => cards.some((c) => c.deck === d.key)), [cards]);

  const [decks, setDecks] = useState<string[]>(() => available.map((d) => d.key));
  const [shuffled, setShuffled] = useState(true);
  const [session, setSession] = useState<Session>(() => startSession(cards.map((c) => c.id)));
  const [history, setHistory] = useState<Session[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [ready, setReady] = useState(false);
  /** Incrémenté à chaque réponse : la carte suivante est remontée sans animation de retournement. */
  const [turn, setTurn] = useState(0);

  const idsFor = useCallback(
    (ds: string[], mix: boolean) => {
      const ids = cards.filter((c) => ds.includes(c.deck)).map((c) => c.id);
      return mix ? shuffle(ids) : ids;
    },
    [cards],
  );

  const restart = useCallback(
    (ds = decks, mix = shuffled, only?: string[]) => {
      setSession(startSession(only ? (mix ? shuffle(only) : only) : idsFor(ds, mix)));
      setHistory([]);
      setFlipped(false);
      setTurn((t) => t + 1);
    },
    [decks, shuffled, idsFor],
  );

  // reprise de la séance précédente (après le rendu serveur, le stockage n'existe que dans le navigateur)
  useEffect(() => {
    const saved = load(prositId);
    const ids = cards.map((c) => c.id);
    const s = saved && reconcile(saved.session, ids);
    if (saved && s) {
      const ds = saved.decks.filter((d) => available.some((a) => a.key === d));
      setDecks(ds.length ? ds : available.map((d) => d.key));
      setShuffled(saved.shuffled);
      setSession(s);
    } else setSession(startSession(shuffle(ids)));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prositId]);

  useEffect(() => {
    if (ready) save(prositId, { decks, shuffled, session });
  }, [ready, prositId, decks, shuffled, session]);

  const current = session.queue[0] ? byId.get(session.queue[0]) : undefined;
  const done = ready && session.total > 0 && session.queue.length === 0;

  const respond = useCallback(
    (knew: boolean) => {
      if (!current) return;
      setHistory((h) => [...h.slice(-49), session]);
      setSession((s) => answer(s, knew));
      setFlipped(false);
      setTurn((t) => t + 1);
    },
    [current, session],
  );

  const undo = useCallback(() => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setSession(prev);
    setFlipped(true);
    setTurn((t) => t + 1);
  }, [history]);

  const toggleDeck = (key: string) => {
    const next = decks.includes(key) ? decks.filter((d) => d !== key) : [...decks, key];
    if (!next.length) return;
    setDecks(next);
    restart(next, shuffled);
  };

  useEffect(() => {
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
  }, [flipped, respond, undo]);

  const deckLabel = (key: string) => DECKS.find((d) => d.key === key);
  const missed = Object.keys(session.misses).filter((id) => byId.has(id));
  const pct = session.total ? Math.round((session.known.length / session.total) * 100) : 0;

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
          <button className="btn" onClick={() => restart()} title="Recommencer avec tout le paquet">
            <IconReset /> <span className="hidden sm:inline">Recommencer</span>
          </button>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="rounded-sm border border-line bg-surface p-6 text-sm">
          <p className="font-semibold">Aucune carte à réviser pour l’instant.</p>
          <p className="mt-2 text-muted">
            Les cartes sont créées à partir du prosit retour : les <strong>mots clés</strong> avec leur définition, les <strong>notions</strong> de la synthèse, les{" "}
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
              const n = cards.filter((c) => c.deck === d.key).length;
              return (
                <button
                  key={d.key}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? "border-ink bg-ink text-bg" : "border-line bg-surface text-muted hover:border-ink"}`}
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

          {/* progression */}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted">
              <span>
                <strong className="text-ink tabular-nums">{session.known.length}</strong> / {session.total} validées
              </span>
              <span className="tabular-nums">
                {session.queue.length} dans le paquet{missed.length > 0 && ` · ${missed.length} ratée${missed.length > 1 ? "s" : ""}`}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {done ? (
            <div className="rounded-sm border border-line bg-surface p-6 text-center sm:p-10">
              <p className="title-cesi text-3xl">
                <span className="underline-accent">Paquet terminé</span>
              </p>
              <p className="mt-3 text-sm text-muted">
                {session.total} carte{session.total > 1 ? "s" : ""} validée{session.total > 1 ? "s" : ""}
                {missed.length ? ` · ${missed.length} ratée${missed.length > 1 ? "s" : ""} au moins une fois` : " du premier coup, sans erreur"}.
              </p>
              {missed.length > 0 && (
                <ul className="mx-auto mt-5 max-w-md space-y-1 text-left text-sm">
                  {missed
                    .sort((a, b) => session.misses[b] - session.misses[a])
                    .slice(0, 8)
                    .map((id) => (
                      <li key={id} className="flex gap-3 border-b border-line py-1.5 last:border-0">
                        <span className="min-w-0 flex-1 truncate">
                          <Inline text={byId.get(id)!.front} />
                        </span>
                        <span className="shrink-0 tabular-nums text-muted">{session.misses[id]}×</span>
                      </li>
                    ))}
                </ul>
              )}
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {missed.length > 0 && (
                  <button className="btn btn-primary" onClick={() => restart(decks, shuffled, missed)}>
                    {missed.length > 1 ? `Revoir les ${missed.length} cartes ratées` : "Revoir la carte ratée"}
                  </button>
                )}
                <button className="btn" onClick={() => restart()}>
                  <IconReset /> Tout recommencer
                </button>
              </div>
            </div>
          ) : current ? (
            <>
              <FlipCard key={`${current.id}-${turn}`} card={current} prompt={deckLabel(current.deck)} misses={session.misses[current.id] ?? 0} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />

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
          ) : null}
        </>
      )}
    </main>
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
