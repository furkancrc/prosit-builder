"use client";

import { useEffect, useRef, useState } from "react";
import { buildDocModel, listMarker, numberItems, type Block } from "@/lib/doc-model";
import { readableOn } from "@/lib/color";
import { channelName, type PresentationMessage } from "@/lib/presentation";
import { IconExpand } from "./icons";

type State = Extract<PresentationMessage, { kind: "state" }>;

/** Regroupe les blocs du modèle par section (index 0 = en-tête, i + 1 = section i). */
function groupBySection(blocks: Block[]) {
  const groups: { title: string; num?: string; blocks: Block[] }[] = [];
  for (const b of blocks) {
    if (b.kind === "section") groups.push({ title: b.title, num: b.num, blocks: [] });
    else groups[groups.length - 1]?.blocks.push(b);
  }
  return groups;
}

/**
 * Vue à projeter : grande typographie, fond sombre, rubrique en cours surlignée.
 * Reçoit l'état de l'éditeur en direct par BroadcastChannel.
 */
export function Presentation({ prositId, initial, accent, secondary }: { prositId: string; initial: State; accent: string; secondary: string }) {
  const [state, setState] = useState<State>(initial);
  const [connected, setConnected] = useState(false);
  const refs = useRef<(HTMLElement | null)[]>([]);

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

  useEffect(() => {
    document.title = `Présentation · ${state.meta.nom || "Prosit"}`;
  }, [state.meta.nom]);

  useEffect(() => {
    refs.current[state.active]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state.active]);

  const model = buildDocModel(state.meta, state.tab, state.content);
  const groups = groupBySection(model.blocks);
  const fg = readableOn(accent);

  return (
    <main className="min-h-dvh bg-[#0d0d0d] px-[4vw] py-[3vw] text-[#f2f2f2]" style={{ fontSize: "clamp(16px, 1.45vw, 30px)" }}>
      <div className="fixed right-4 top-4 z-10 flex items-center gap-3 text-xs text-white/50">
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-white/30"}`} />
          {connected ? "En direct" : "En attente de l’éditeur"}
        </span>
        <button
          className="rounded-sm border border-white/20 p-1.5 hover:border-white/60 hover:text-white"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
          title="Plein écran"
          aria-label="Plein écran"
        >
          <IconExpand />
        </button>
      </div>

      <header
        ref={(el) => {
          refs.current[0] = el;
        }}
        className={`mb-[2.5vw] rounded-sm transition-shadow ${state.active === 0 ? "ring-4 ring-offset-8 ring-offset-[#0d0d0d]" : ""}`}
        style={{ ["--tw-ring-color" as string]: accent }}
      >
        <div className="inline-block bg-black px-[0.8em] py-[0.3em] text-[0.8em] font-bold tracking-wide text-white outline outline-1 outline-white/20">{model.banner}</div>
        <h1 className="px-[0.8em] py-[0.6em] text-[2em] font-bold leading-tight" style={{ background: accent, color: fg }}>
          {model.title}
        </h1>
        {model.info && <p className="mt-2 text-[0.7em] text-white/50">{model.info}</p>}
      </header>

      <div className="grid gap-[1.6vw] lg:grid-cols-2">
        {groups.map((g, i) => {
          const idx = i + 1;
          const on = state.active === idx;
          return (
            <section
              key={g.title}
              ref={(el) => {
                refs.current[idx] = el;
              }}
              className={`rounded-sm border bg-white/[0.03] p-[1.1em] transition-all duration-300 ${on ? "scale-[1.01] bg-white/[0.07]" : "border-white/10 opacity-80"}`}
              style={on ? { borderColor: accent, boxShadow: `0 0 0 2px ${accent}, 0 0 40px ${accent}33` } : undefined}
            >
              <h2 className="mb-[0.5em] flex items-baseline gap-[0.4em] border-b border-white/15 pb-[0.3em] text-[1.25em] font-bold">
                <span className="inline-block h-[0.9em] w-[0.5em] shrink-0 self-center" style={{ background: accent }} />
                {g.num && <span style={{ color: secondary }}>{g.num}</span>}
                <span>{g.title}</span>
              </h2>
              <div className="space-y-[0.3em] leading-snug">{g.blocks.map((b, k) => renderBlock(b, k, secondary))}</div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function renderBlock(b: Block, k: number, secondary: string) {
  switch (b.kind) {
    case "subheading":
      return <p key={k} className="mt-[0.4em] font-bold">{b.text}</p>;
    case "para":
      return <p key={k}>{b.text}</p>;
    case "empty":
      return <p key={k} className="text-white/30">…</p>;
    case "roles":
      return (
        <ul key={k} className="grid gap-x-[1em] sm:grid-cols-2">
          {b.items.map((r) => (
            <li key={r.label}>
              <span className="text-white/60">{r.label} :</span> <strong>{r.value}</strong>
            </li>
          ))}
        </ul>
      );
    case "list": {
      const nums = numberItems(b.items);
      return (
        <ul key={k}>
          {b.items.map((it, i) => {
            const m = listMarker(b.style, it.level, nums[i]);
            return (
              <li key={it.id} className="flex gap-[0.5em]" style={{ paddingLeft: `${it.level * 1.4}em` }}>
                <span className={`shrink-0 font-bold ${m === "■" ? "text-[0.6em] leading-[2.4]" : ""}`} style={{ color: secondary }}>
                  {m}
                </span>
                <span className="min-w-0 break-words">{it.text}</span>
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
