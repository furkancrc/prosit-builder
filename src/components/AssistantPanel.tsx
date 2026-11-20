"use client";

import { Fragment, useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import { api } from "@/lib/client-api";
import { extractInsertable, INSERT_FENCE } from "@/lib/ai/insert";
import { targetPatch, type AssistTarget } from "@/lib/ai/targets";
import type { DocType } from "@/lib/schema";
import { Inline } from "./RichView";
import { IconCopy, IconLink, IconPlus, IconSend, IconSparkle, IconStop, IconTrash } from "./icons";

export interface FocusField {
  key: string;
  label: string;
  kind: "list" | "text";
  withDetail: boolean;
}
export interface FocusSection {
  title: string;
  fields: FocusField[];
}

interface Source {
  title: string;
  url: string;
}
interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: string;
  /** Libellé court affiché à la place du prompt complet d'une action rapide. */
  label?: string;
  /** Élément ou champ visé par un bouton de l'éditeur : la réponse peut lui être appliquée. */
  target?: AssistTarget;
}

/** Ce que l'éditeur peut demander au panneau (boutons des éléments et des champs). */
export interface AssistantApi {
  ask: (prompt: string, label: string, target?: AssistTarget) => void;
}
interface LinkStatus {
  url: string;
  ok: boolean;
  title?: string;
  error?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  prositId: string;
  tab: DocType;
  initialLinks: string[];
  focus: FocusSection | null;
  /** Enregistre les modifications en attente avant que le serveur relise le prosit. */
  beforeAsk: () => Promise<void>;
  onInsert: (field: FocusField, text: string, mode: "append" | "replace") => void;
  onApply: (target: AssistTarget, patch: { text?: string; detail?: string }) => void;
  apiRef: RefObject<AssistantApi | null>;
}

/**
 * Assistant de rédaction (Perplexity). Rien n'est envoyé tant que l'étudiant ne pose pas de question
 * ou ne clique pas sur une action ; le document entier et les liens d'aide sont joints à chaque demande.
 */
export function AssistantPanel({ open, onClose, prositId, tab, initialLinks, focus, beforeAsk, onInsert, onApply, apiRef }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [links, setLinks] = useState<string[]>(initialLinks);
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<Record<string, LinkStatus>>({});
  const [showLinks, setShowLinks] = useState(initialLinks.length === 0);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || enabled !== null) return;
    api<{ enabled: boolean }>("/api/assistant")
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, [open, enabled]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ---------- liens d'aide ----------

  async function saveLinks(next: string[]) {
    setLinkError(null);
    try {
      const r = await api<{ links: string[] }>(`/api/prosits/${prositId}/liens`, { method: "PUT", body: JSON.stringify({ links: next }) });
      setLinks(r.links);
      return true;
    } catch (e) {
      setLinkError((e as Error).message);
      return false;
    }
  }

  async function addLinks() {
    const urls = linkInput
      .split(/\s+/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (!urls.length) return;
    const bad = urls.find((u) => !/^https?:\/\/\S+\.\S+/i.test(u));
    if (bad) return setLinkError(`Lien invalide : ${bad}`);
    if (await saveLinks([...links, ...urls.filter((u) => !links.includes(u))])) setLinkInput("");
  }

  // ---------- discussion ----------

  async function ask(prompt: string, label?: string, target?: AssistTarget) {
    if (busy || !prompt.trim()) return;
    const history = messages.filter((m) => !m.error && m.content);
    const next: Msg[] = [...messages, { role: "user", content: prompt.trim(), label }, { role: "assistant", content: "", target }];
    setMessages(next);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const patchLast = (fn: (m: Msg) => Msg) => setMessages((ms) => [...ms.slice(0, -1), fn(ms[ms.length - 1])]);

    try {
      await beforeAsk();
      const res = await fetch("/api/assistant", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prositId,
          type: target?.tab ?? tab,
          focus: target?.section ?? focus?.title,
          messages: [...history.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: prompt.trim() }],
        }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `Erreur ${res.status}`);

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.t === "delta") patchLast((m) => ({ ...m, content: m.content + ev.text }));
          else if (ev.t === "sources") patchLast((m) => ({ ...m, sources: ev.sources }));
          else if (ev.t === "links") setLinkStatus(Object.fromEntries((ev.links as LinkStatus[]).map((l) => [l.url, l])));
          else if (ev.t === "error") patchLast((m) => ({ ...m, error: ev.error }));
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") patchLast((m) => ({ ...m, error: (e as Error).message }));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  // L'éditeur appelle ask() depuis les boutons des éléments ; la référence suit le dernier rendu.
  const askRef = useRef(ask);
  askRef.current = ask;
  useImperativeHandle(apiRef, () => ({ ask: (prompt, label, target) => askRef.current(prompt, label, target) }), []);

  const quick: { label: string; prompt: string }[] = [];
  if (focus) {
    const isRetour = tab === "retour";
    quick.push({
      label: `Proposer pour « ${focus.title} »`,
      prompt: `Propose du contenu pour la rubrique « ${focus.title} » du prosit ${tab}, en tenant compte de ce qui est déjà écrit (ne répète pas l'existant)${
        isRetour ? " ; pour chaque élément, donne une définition ou explication précise et sourcée" : ""
      }. Mets le contenu à insérer dans un bloc \`\`\`${INSERT_FENCE}\`\`\`.`,
    });
    quick.push({
      label: `Corriger « ${focus.title} »`,
      prompt: `Corrige la rubrique « ${focus.title} » (orthographe, grammaire, clarté, termes techniques). Donne la version corrigée complète de la rubrique dans un bloc \`\`\`${INSERT_FENCE}\`\`\`, puis la liste courte des corrections faites.`,
    });
  }
  quick.push({
    label: "Relire tout le prosit",
    prompt: `Relis tout le prosit ${tab} : signale les rubriques vides ou faibles, les incohérences entre rubriques, les erreurs et ce qui manque. Réponds par une liste de remarques courtes, rubrique par rubrique. Ne réécris pas le prosit.`,
  });

  return (
    <aside
      className={`fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-surface shadow-2xl sm:w-[30rem] ${open ? "" : "hidden"}`}
      aria-label="Assistant IA"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <IconSparkle />
        <h2 className="title-cesi text-base">
          <span className="underline-accent">Assistant</span>
        </h2>
        <span className="text-xs text-muted">Perplexity</span>
        {messages.length > 0 && (
          <button className="btn btn-ghost ml-auto text-xs" onClick={() => setMessages([])} disabled={busy} title="Effacer la discussion">
            <IconTrash width={14} height={14} /> Effacer
          </button>
        )}
        <button className={`text-xl text-muted hover:text-ink ${messages.length ? "" : "ml-auto"}`} onClick={onClose} aria-label="Fermer l’assistant" title="Fermer (Échap)">
          ×
        </button>
      </header>

      {/* Liens d'aide */}
      <section className="border-b border-line px-4 py-2 text-sm">
        <button className="flex w-full items-center gap-2 text-left text-xs font-semibold" onClick={() => setShowLinks((s) => !s)} aria-expanded={showLinks}>
          <IconLink width={14} height={14} /> Liens d’aide ({links.length})
          <span className="ml-auto font-normal text-muted">{showLinks ? "masquer" : "afficher"}</span>
        </button>
        {showLinks && (
          <div className="mt-2 space-y-1.5">
            <p className="text-xs text-muted">Les pages sont lues et jointes à chaque question. Les pages Moodle privées et les PDF ne peuvent pas être lus : colle alors le texte utile dans la discussion.</p>
            {links.map((u) => {
              const st = linkStatus[u];
              return (
                <div key={u} className="flex items-center gap-2 text-xs">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${!st ? "bg-line" : st.ok ? "bg-emerald-500" : "bg-danger"}`}
                    title={!st ? "Pas encore lu" : st.ok ? "Lu" : st.error}
                  />
                  <a href={u} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:underline" title={u}>
                    {st?.title || u}
                  </a>
                  {st && !st.ok && <span className="shrink-0 text-danger">{st.error}</span>}
                  <button className="shrink-0 text-muted hover:text-danger" onClick={() => saveLinks(links.filter((l) => l !== u))} aria-label={`Retirer ${u}`}>
                    ×
                  </button>
                </div>
              );
            })}
            <div className="flex gap-2">
              <input
                className="field min-w-0 flex-1 py-1 text-xs"
                placeholder="https://… (plusieurs liens séparés par un espace)"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLinks())}
              />
              <button className="btn text-xs" onClick={addLinks} disabled={!linkInput.trim()}>
                <IconPlus width={14} height={14} /> Ajouter
              </button>
            </div>
            {linkError && <p className="text-xs text-danger">{linkError}</p>}
          </div>
        )}
      </section>

      {/* Discussion */}
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {enabled === false && (
          <p className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-xs">
            Assistant désactivé : ajoute <code>PERPLEXITY_API_KEY=…</code> dans le fichier <code>.env</code> du projet, puis redémarre le serveur.
          </p>
        )}
        {messages.length === 0 && enabled !== false && (
          <p className="text-xs text-muted">
            L’assistant ne fait rien tant que tu ne lui demandes rien. Il voit tout le prosit {tab === "retour" ? "(et l’aller)" : ""} et tes liens d’aide.
            {focus ? ` Rubrique en cours : « ${focus.title} ».` : " Clique sur une rubrique pour cibler ta demande."}
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-8 whitespace-pre-wrap rounded-sm bg-surface-2 px-3 py-2">
              {m.label ?? m.content}
            </div>
          ) : (
            <AssistantMessage key={i} msg={m} streaming={busy && i === messages.length - 1} focus={focus} onInsert={onInsert} onApply={onApply} />
          ),
        )}
      </div>

      {/* Saisie */}
      <footer className="border-t border-line px-4 py-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button key={q.label} className="btn max-w-full truncate px-2 py-1 text-xs" disabled={busy || enabled === false} onClick={() => ask(q.prompt, q.label)}>
              {q.label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            className="field max-h-40 min-h-[2.5rem] flex-1 resize-y text-sm"
            rows={2}
            placeholder="Pose une question, demande une définition, une reformulation…"
            value={input}
            disabled={enabled === false}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                ask(input);
              }
              if (e.key === "Escape") onClose();
            }}
          />
          {busy ? (
            <button className="btn btn-icon" onClick={() => abort.current?.abort()} aria-label="Arrêter" title="Arrêter">
              <IconStop />
            </button>
          ) : (
            <button className="btn btn-primary btn-icon" onClick={() => ask(input)} disabled={!input.trim() || enabled === false} aria-label="Envoyer" title="Envoyer (Entrée)">
              <IconSend />
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted">Entrée pour envoyer, Maj+Entrée pour aller à la ligne. Vérifie toujours ce que propose l’IA.</p>
      </footer>
    </aside>
  );
}

function AssistantMessage({
  msg,
  streaming,
  focus,
  onInsert,
  onApply,
}: {
  msg: Msg;
  streaming: boolean;
  focus: FocusSection | null;
  onInsert: Props["onInsert"];
  onApply: Props["onApply"];
}) {
  const patch = streaming || !msg.target ? null : targetPatch(msg.content);
  const [applied, setApplied] = useState(false);
  const insertable = streaming || msg.target ? null : extractInsertable(msg.content);
  const [field, setField] = useState(0);
  const [copied, setCopied] = useState(false);
  const target = focus?.fields[Math.min(field, focus.fields.length - 1)];

  return (
    <div className="space-y-2">
      {msg.content ? <Markdown text={msg.content} sources={msg.sources} /> : streaming && <p className="animate-pulse text-xs text-muted">Lecture du prosit et des liens, recherche…</p>}
      {msg.error && <p className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-xs">{msg.error}</p>}
      {msg.sources && msg.sources.length > 0 && !streaming && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Sources ({msg.sources.length})</summary>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            {msg.sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </details>
      )}
      {!streaming && msg.content && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            className="btn btn-ghost px-2 py-1 text-xs"
            onClick={() => {
              navigator.clipboard.writeText(insertable ?? patch?.detail ?? patch?.text ?? msg.content).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            <IconCopy width={13} height={13} /> {copied ? "Copié" : "Copier"}
          </button>
          {patch && msg.target && (
            <button
              className="btn btn-primary px-2 py-1 text-xs"
              onClick={() => {
                onApply(msg.target!, patch);
                setApplied(true);
              }}
              title="Remplace le texte visé par la proposition (Ctrl+Z pour annuler)"
            >
              {applied ? "Appliqué ✓" : msg.target.kind === "item" ? "Appliquer à l’élément" : `Appliquer à « ${msg.target.fieldLabel} »`}
            </button>
          )}
          {insertable && target && (
            <>
              {focus!.fields.length > 1 && (
                <select className="field w-auto py-1 text-xs" value={field} onChange={(e) => setField(Number(e.target.value))} aria-label="Champ cible">
                  {focus!.fields.map((f, i) => (
                    <option key={f.key} value={i}>
                      {f.label}
                    </option>
                  ))}
                </select>
              )}
              <button className="btn px-2 py-1 text-xs" onClick={() => onInsert(target, insertable, "append")} title="Ajoute à la fin de la rubrique (Ctrl+Z pour annuler)">
                <IconPlus width={13} height={13} /> Ajouter à « {target.label} »
              </button>
              <button
                className="btn btn-ghost px-2 py-1 text-xs"
                onClick={() => confirm(`Remplacer tout le contenu de « ${target.label} » ? (Ctrl+Z pour annuler)`) && onInsert(target, insertable, "replace")}
              >
                Remplacer
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Rendu Markdown minimal : blocs de code, titres, puces, **gras** et renvois [n] vers les sources. */
function Markdown({ text, sources }: { text: string; sources?: Source[] }) {
  const parts = text.split(/(```[^\n]*\n[\s\S]*?(?:```|$))/g);
  return (
    <div className="space-y-1.5 leading-relaxed">
      {parts.map((p, i) => {
        const fence = p.match(/^```([^\n]*)\n([\s\S]*?)(?:```)?$/);
        if (fence)
          return (
            <pre key={i} className={`overflow-x-auto whitespace-pre-wrap rounded-sm border px-3 py-2 font-sans text-[13px] ${fence[1].trim().startsWith(INSERT_FENCE) ? "border-accent bg-accent/10" : "border-line bg-surface-2"}`}>
              {fence[2].trimEnd()}
            </pre>
          );
        return p
          .split(/\n{2,}/)
          .filter((b) => b.trim())
          .map((block, j) => (
            <div key={`${i}-${j}`}>
              {block.split("\n").map((line, k) => {
                const h = line.match(/^#{1,6}\s+(.*)$/);
                const li = line.match(/^(\s*)(?:[-*•]|\d+[.)])\s+(.*)$/);
                const body = h ? h[1] : li ? li[2] : line;
                return (
                  <p key={k} className={h ? "mt-1 font-semibold" : li ? "flex gap-1.5" : ""} style={li ? { paddingLeft: `${Math.floor(li[1].length / 2) * 0.9}rem` } : undefined}>
                    {li && <span className="text-muted">•</span>}
                    <span>
                      <Cited text={body} sources={sources} />
                    </span>
                  </p>
                );
              })}
            </div>
          ));
      })}
    </div>
  );
}

function Cited({ text, sources }: { text: string; sources?: Source[] }) {
  const bits = text.split(/(\[\d+\])/g);
  return (
    <>
      {bits.map((b, i) => {
        const n = b.match(/^\[(\d+)\]$/);
        const src = n && sources?.[Number(n[1]) - 1];
        if (src)
          return (
            <a key={i} href={src.url} target="_blank" rel="noopener noreferrer" title={src.title} className="align-super text-[10px] text-muted hover:text-ink">
              [{n![1]}]
            </a>
          );
        return (
          <Fragment key={i}>
            <Inline text={b} />
          </Fragment>
        );
      })}
    </>
  );
}
