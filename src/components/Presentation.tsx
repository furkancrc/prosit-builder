"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildDocModel, listMarker, numberItems, type Block } from "@/lib/doc-model";
import { readableOn } from "@/lib/color";
import { channelName, type PresentationMessage } from "@/lib/presentation";
import { prositLabel } from "@/lib/meta";
import { STATUS_META, type ListItem, type PisteStatus } from "@/lib/schema";
import { IconExpand } from "./icons";
import { BlocksView, Inline, KeywordTable } from "./RichView";

type State = Extract<PresentationMessage, { kind: "state" }>;
type Theme = "sombre" | "clair";

/** Couleurs de statut lisibles sur fond sombre (projection) ; sur fond clair, le surlignage du document. */
const STATUS_ON_DARK: Record<PisteStatus, string> = { valid: "#4ADE80", partial: "#FBBF24", invalid: "#F87171" };

interface Slide {
  title: string;
  num?: string;
  /** Entrée de navigation de l'éditeur (0 = en-tête, i + 1 = rubrique i du gabarit). */
  nav: number;
  blocks: Block[];
  /** Sous-titre (« Études · 1 / 3 ») des diapositives d'un élément du plan d'action. */
  sub?: string;
}

/**
 * Une diapositive par rubrique (les rubriques vides propres au retour sont déjà retirées du modèle) ;
 * le plan d'action, souvent long, est découpé en une diapositive par élément.
 */
function toSlides(blocks: Block[]): Slide[] {
  const sections: Slide[] = [];
  for (const b of blocks) {
    if (b.kind === "section") sections.push({ title: b.label, num: b.num, nav: b.nav, blocks: [] });
    else sections[sections.length - 1]?.blocks.push(b);
  }
  return sections.flatMap((s) => {
    if (!s.blocks.some((b) => b.kind === "list" && b.plan && b.items.length)) return [s];
    const out: Slide[] = [];
    let heading = "";
    for (const b of s.blocks) {
      if (b.kind === "subheading") heading = b.text.replace(/\s*:\s*$/, "");
      else if (b.kind === "list" && b.plan)
        b.items.forEach((it, i) =>
          out.push({ ...s, sub: `${heading ? `${heading} · ` : ""}${i + 1} / ${b.items.length}`, blocks: [{ ...b, items: [it] }] }),
        );
    }
    return out.length ? out : [s];
  });
}

/**
 * Vue à projeter : une diapositive par rubrique, texte ajusté à l'écran, navigation au clavier.
 * Suit la rubrique ouverte dans l'éditeur (BroadcastChannel) tant que « Suivre l'éditeur » est actif.
 */
export function Presentation({ prositId, initial, accent, secondary }: { prositId: string; initial: State; accent: string; secondary: string }) {
  const [state, setState] = useState<State>(initial);
  const [connected, setConnected] = useState(false);
  const [follow, setFollow] = useState(true);
  const [theme, setTheme] = useState<Theme>("sombre");
  const [showHelp, setShowHelp] = useState(false);

  const model = buildDocModel(state.meta, state.tab, state.content);
  const slides = useMemo(() => toSlides(model.blocks), [model.blocks]);
  const total = slides.length + 1; // + la diapositive de titre

  /** Diapositive qui correspond à la rubrique ouverte dans l'éditeur. */
  const slideOf = useCallback(
    (active: number) => {
      if (active <= 0) return 0;
      let best = 0;
      slides.forEach((s, i) => {
        if (s.nav <= active) best = i + 1;
      });
      return best;
    },
    [slides],
  );
  const [index, setIndex] = useState(() => slideOf(initial.active));
  const current = Math.min(index, total - 1);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(channelName(prositId));
    ch.onmessage = (e: MessageEvent<PresentationMessage>) => {
      if (e.data?.kind === "state") {
        setState(e.data);
        setConnected(true);
      }
    };
    ch.postMessage({ kind: "hello" } satisfies PresentationMessage);
    return () => ch.close();
  }, [prositId]);

  // suit la rubrique ouverte dans l'éditeur (seulement quand elle change)
  const lastActive = useRef(initial.active);
  useEffect(() => {
    if (state.active === lastActive.current) return;
    lastActive.current = state.active;
    if (follow) setIndex(slideOf(state.active));
  }, [state.active, follow, slideOf]);

  useEffect(() => {
    document.title = `Présentation · ${prositLabel(state.meta)}`;
  }, [state.meta]);

  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(total - 1, i))), [total]);
  const toggleFullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(k)) go(current + 1);
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(k)) go(current - 1);
      else if (k === "Home") go(0);
      else if (k === "End") go(total - 1);
      else if (k === "f" || k === "F") toggleFullscreen();
      else if (k === "s" || k === "S") setFollow((f) => !f);
      else if (k === "t" || k === "T") setTheme((t) => (t === "sombre" ? "clair" : "sombre"));
      else if (k === "?" || k === "h" || k === "H") setShowHelp((h) => !h);
      else if (k === "Escape") setShowHelp(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, total, go]);

  const dark = theme === "sombre";
  const c = dark
    ? { bg: "#0f0f10", fg: "#f4f4f5", muted: "rgba(255,255,255,0.55)", line: "rgba(255,255,255,0.12)", soft: "rgba(255,255,255,0.75)" }
    : { bg: "#fbfbf8", fg: "#111111", muted: "rgba(0,0,0,0.55)", line: "rgba(0,0,0,0.12)", soft: "rgba(0,0,0,0.72)" };
  const slide = current > 0 ? slides[current - 1] : null;

  return (
    <main className="flex h-dvh flex-col overflow-hidden select-none" style={{ background: c.bg, color: c.fg }}>
      {/* barre du haut : prosit, position, état */}
      <header className="flex shrink-0 items-center gap-3 px-[3vw] pt-[1.6vh] text-[clamp(11px,0.9vw,16px)]" style={{ color: c.muted }}>
        <span className="truncate font-semibold">
          {model.banner} · {model.title}
        </span>
        <span className="ml-auto tabular-nums">
          {current + 1} / {total}
        </span>
        <button className="rounded-full border px-2.5 py-0.5" style={{ borderColor: c.line }} onClick={() => setFollow((f) => !f)} title="Suivre la rubrique ouverte dans l’éditeur (S)">
          <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${connected && follow ? "bg-emerald-400" : "bg-current opacity-40"}`} />
          {!connected ? "Éditeur non connecté" : follow ? "Suit l’éditeur" : "Navigation libre"}
        </button>
        <button className="rounded-sm border px-2 py-0.5" style={{ borderColor: c.line }} onClick={() => setTheme(dark ? "clair" : "sombre")} title="Fond clair / sombre (T)">
          {dark ? "Clair" : "Sombre"}
        </button>
        <button className="rounded-sm border p-1" style={{ borderColor: c.line }} onClick={toggleFullscreen} title="Plein écran (F)" aria-label="Plein écran">
          <IconExpand width={16} height={16} />
        </button>
      </header>

      {/* diapositive */}
      <FitBox key={`${current}-${theme}`} deps={[state.content, state.meta]}>
        {slide ? (
          <>
            <h2 className="mb-[0.7em] flex items-center gap-[0.45em] text-[2.1em] font-bold leading-tight">
              <span className="inline-block h-[1em] w-[0.38em] shrink-0" style={{ background: accent }} />
              {slide.num && <span style={{ color: secondary }}>{slide.num}</span>}
              <span>{slide.title}</span>
              {slide.sub && (
                <span className="ml-auto text-[0.45em] font-semibold" style={{ color: c.muted }}>
                  {slide.sub}
                </span>
              )}
            </h2>
            <div className="space-y-[0.55em] leading-snug">{slide.blocks.map((b, k) => renderBlock(b, k, { secondary, accent, dark, c }))}</div>
          </>
        ) : (
          <div className="flex h-full flex-col justify-center">
            <div className="self-start bg-black px-[0.8em] py-[0.3em] text-[0.9em] font-bold tracking-wide text-white">{model.banner}</div>
            <h1 className="px-[0.7em] py-[0.55em] text-[3em] font-bold leading-tight" style={{ background: accent, color: readableOn(accent) }}>
              {model.title}
            </h1>
            {model.info && (
              <p className="mt-[0.8em] text-[1em]" style={{ color: c.muted }}>
                {model.info}
              </p>
            )}
            <ol className="mt-[1.6em] grid grid-cols-2 gap-x-[2em] gap-y-[0.25em] text-[0.9em] lg:grid-cols-3" style={{ color: c.soft }}>
              {/* sommaire : une entrée par rubrique (la 1re diapositive du plan d'action pour ses éléments) */}
              {slides.map((s, i) => (i > 0 && slides[i - 1].nav === s.nav ? null : (
                <li key={s.nav}>
                  <button className="text-left hover:underline" onClick={() => go(i + 1)}>
                    {s.num && <span style={{ color: secondary }}>{s.num} </span>}
                    {s.title}
                  </button>
                </li>
              )))}
            </ol>
          </div>
        )}
      </FitBox>

      {/* bas : précédent / suivant et barre de progression cliquable */}
      <footer className="flex shrink-0 items-center gap-3 px-[3vw] pb-[1.6vh] text-[clamp(11px,0.9vw,16px)]" style={{ color: c.muted }}>
        <button className="rounded-sm border px-2 py-0.5 disabled:opacity-30" style={{ borderColor: c.line }} onClick={() => go(current - 1)} disabled={current === 0} aria-label="Précédente">
          ←
        </button>
        <div className="flex min-w-0 flex-1 gap-1">
          {Array.from({ length: total }, (_, i) => (
            <button
              key={i}
              className="h-1.5 flex-1 rounded-full transition-colors"
              style={{ background: i === current ? accent : i < current ? c.soft : c.line, opacity: i < current ? 0.45 : 1 }}
              onClick={() => go(i)}
              title={i === 0 ? "Titre" : `${slides[i - 1].title}${slides[i - 1].sub ? ` · ${slides[i - 1].sub}` : ""}`}
              aria-label={i === 0 ? "Titre" : slides[i - 1].title}
            />
          ))}
        </div>
        <button className="rounded-sm border px-2 py-0.5 disabled:opacity-30" style={{ borderColor: c.line }} onClick={() => go(current + 1)} disabled={current === total - 1} aria-label="Suivante">
          →
        </button>
        <button className="rounded-sm border px-2 py-0.5" style={{ borderColor: c.line }} onClick={() => setShowHelp((h) => !h)} title="Raccourcis (?)">
          ?
        </button>
      </footer>

      {showHelp && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60" onClick={() => setShowHelp(false)}>
          <div className="rounded-md p-6 text-sm shadow-2xl" style={{ background: c.bg, color: c.fg }}>
            <p className="mb-3 font-bold">Raccourcis</p>
            <ul className="space-y-1">
              <li>→ / Espace / Page suiv. : rubrique suivante</li>
              <li>← / Page préc. : rubrique précédente</li>
              <li>Début / Fin : titre / dernière rubrique</li>
              <li>S : suivre l’éditeur ou naviguer librement</li>
              <li>T : fond clair / sombre · F : plein écran</li>
            </ul>
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * Zone de la diapositive : ajuste la taille du texte pour que tout tienne à l’écran
 * (de 55 à 160 % ; au-delà on peut faire défiler).
 */
function FitBox({ children, deps }: { children: React.ReactNode; deps: unknown[] }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<number | undefined>(undefined);

  const fit = useCallback(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    // taille de base selon la largeur de l'écran, puis plus grande échelle (55 % à 160 %) qui tient en hauteur
    const base = Math.min(38, Math.max(16, window.innerWidth * 0.0175));
    const fits = (s: number) => {
      i.style.fontSize = `${base * s}px`;
      return i.scrollHeight <= i.clientHeight + 1;
    };
    let lo = 0.55;
    let hi = 1.6;
    if (fits(hi)) lo = hi;
    else
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
    setSize(base * lo);
    i.style.fontSize = `${base * lo}px`;
  }, []);

  useLayoutEffect(() => {
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, ...deps]);

  return (
    <div ref={box} className="min-h-0 flex-1 overflow-auto px-[5vw] py-[3vh]">
      <div ref={inner} className="mx-auto h-full max-w-[1500px]" style={{ fontSize: size ? `${size}px` : "clamp(16px, 1.75vw, 38px)" }}>
        {children}
      </div>
    </div>
  );
}

interface Ctx {
  secondary: string;
  accent: string;
  dark: boolean;
  c: { fg: string; muted: string; line: string; soft: string };
}

function StatusBadge({ status, dark }: { status: PisteStatus; dark: boolean }) {
  const m = STATUS_META[status];
  return (
    <span
      className="mr-[0.45em] inline-block rounded-[0.3em] px-[0.4em] text-[0.7em] font-bold align-[0.12em] whitespace-nowrap"
      style={dark ? { color: STATUS_ON_DARK[status], border: `1.5px solid ${STATUS_ON_DARK[status]}` } : { background: m.highlight, color: "#111" }}
    >
      {m.symbol} {m.short}
    </span>
  );
}

function PlanItem({ it, marker, ctx }: { it: ListItem; marker: string; ctx: Ctx }) {
  return (
    <li className="flex gap-[0.55em]">
      <Marker m={marker} color={ctx.secondary} />
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          <Inline text={it.text} />
        </p>
        {it.description
          ?.split(/\r?\n/)
          .filter((l) => l.trim())
          .map((l, j) => (
            <p key={j} className="mt-[0.15em]" style={{ color: ctx.c.soft }}>
              <Inline text={l} />
            </p>
          ))}
        {!!it.points?.length && (
          <ul className="mt-[0.2em] space-y-[0.1em]">
            {it.points.map((p, j) =>
              p.label && !p.texte.trim() ? (
                <li key={j} className="mt-[0.3em] font-semibold">
                  {p.label} :
                </li>
              ) : (
                <li key={j} className="flex gap-[0.5em] pl-[0.3em]">
                  <span style={{ color: ctx.secondary }}>•</span>
                  <span>
                    {p.label && <strong>{p.label} : </strong>}
                    <span style={{ color: ctx.c.soft }}>
                      <Inline text={p.texte} />
                    </span>
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
        {!!it.etapes?.length && (
          <ol className="mt-[0.2em] space-y-[0.1em]">
            {it.etapes.map((e, j) => (
              <li key={j} className="flex gap-[0.5em] pl-[0.3em]">
                <span className="tabular-nums font-bold" style={{ color: ctx.secondary }}>
                  {j + 1}.
                </span>
                <span style={{ color: ctx.c.soft }}>
                  <Inline text={e} />
                </span>
              </li>
            ))}
          </ol>
        )}
        {it.detail && (
          <p className="mt-[0.15em] whitespace-pre-wrap" style={{ color: ctx.c.soft }}>
            <Inline text={it.detail} />
          </p>
        )}
        {it.blocks && <BlocksView blocks={it.blocks} dark={ctx.dark} />}
        {it.interet && (
          <p className="mt-[0.3em] border-l-[0.2em] pl-[0.5em]" style={{ borderColor: ctx.accent }}>
            <strong>Intérêt : </strong>
            <Inline text={it.interet} />
          </p>
        )}
      </div>
    </li>
  );
}

function Marker({ m, color }: { m: string; color: string }) {
  return (
    <span className={`shrink-0 font-bold ${m === "■" ? "text-[0.55em] leading-[2.6]" : ""}`} style={{ color }}>
      {m}
    </span>
  );
}

function renderBlock(b: Block, k: number, ctx: Ctx) {
  switch (b.kind) {
    case "subheading":
      return (
        <p key={k} className="mt-[0.5em] text-[1.1em] font-bold">
          {b.text}
        </p>
      );
    case "para":
      return (
        <p key={k} className="whitespace-pre-wrap text-[1.1em]">
          <Inline text={b.text} />
        </p>
      );
    case "empty":
      return (
        <p key={k} className="italic" style={{ color: ctx.c.muted }}>
          Rien pour l’instant.
        </p>
      );
    case "roles":
      return (
        <ul key={k} className="grid grid-cols-2 gap-[0.8em]">
          {b.items.map((r) => (
            <li key={r.label} className="rounded-md border px-[0.8em] py-[0.6em]" style={{ borderColor: ctx.c.line }}>
              <p className="text-[0.7em] uppercase tracking-wide" style={{ color: ctx.c.muted }}>
                {r.label}
              </p>
              <p className="text-[1.3em] font-bold">{r.value || "—"}</p>
            </li>
          ))}
        </ul>
      );
    case "legend":
      return null; // les statuts sont affichés en badge sur chaque hypothèse
    case "list": {
      if (b.asTable) return <KeywordTable key={k} items={b.items} headers={b.asTable} accent={ctx.accent} accentFg={readableOn(ctx.accent)} dark={ctx.dark} />;
      const nums = numberItems(b.items);
      if (b.plan)
        return (
          <ul key={k} className="space-y-[0.8em]">
            {b.items.map((it, i) => (
              <PlanItem key={it.id} it={it} marker={listMarker(b.style, 0, nums[i])} ctx={ctx} />
            ))}
          </ul>
        );
      return (
        <ul key={k} className={b.withStatus ? "space-y-[0.6em]" : "space-y-[0.3em]"}>
          {b.items.map((it, i) => {
            const lines = (it.detail ?? "").split(/\r?\n/).filter((l) => l.trim());
            // « terme : définition » sur une ligne pour un terme court, sinon le texte en dessous
            const inline = !it.status && lines.length > 0 && it.text.trim().split(/\s+/).length <= 6;
            return (
              <li key={it.id} className="flex gap-[0.55em]" style={{ paddingLeft: `${it.level * 1.4}em` }}>
                <Marker m={listMarker(b.style, it.level, nums[i])} color={ctx.secondary} />
                <div className="min-w-0 flex-1 break-words">
                  <p>
                    {it.status && <StatusBadge status={it.status} dark={ctx.dark} />}
                    <span className={it.status || inline || it.blocks ? "font-bold" : ""}>
                      <Inline text={it.text} />
                    </span>
                    {inline && (
                      <span style={{ color: ctx.c.soft }}>
                        {" : "}
                        <Inline text={lines[0]} />
                      </span>
                    )}
                  </p>
                  {(inline ? lines.slice(1) : lines).map((l, j) => (
                    <p key={j} className="mt-[0.1em]" style={{ color: ctx.c.soft }}>
                      <Inline text={l} />
                    </p>
                  ))}
                  {it.blocks && <BlocksView blocks={it.blocks} dark={ctx.dark} />}
                </div>
              </li>
            );
          })}
        </ul>
      );
    }
    default:
      return null;
  }
}
