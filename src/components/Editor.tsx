"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentRow, PrositRow } from "@/lib/db";
import { api, saveApi } from "@/lib/client-api";
import { buildFilename } from "@/lib/filename";
import { effectiveMeta, prositTitle } from "@/lib/meta";
import { channelName, type PresentationMessage } from "@/lib/presentation";
import type { Content, DocType, ListItem, Meta, MetaPatch, Settings } from "@/lib/schema";
import { formatProsit, countChanges } from "@/lib/format";
import { coerceContent, emptyContent, getTemplate, isContentEmpty, mergeAllerIntoRetour, mergeImported, retourToAller, sectionNumbers, type FieldDef, type ImportMergeStats } from "@/lib/templates";
import { DOC_STYLES, toRoman, type DocStyle } from "@/lib/doc-model";
import { textForTextField, textToListItems } from "@/lib/ai/insert";
import { newItemId } from "@/lib/list-ops";
import { toggleColorMode } from "@/lib/theme-client";
import { AssistantPanel, type AssistantApi, type FocusField, type FocusSection } from "./AssistantPanel";
import { AssistMenu } from "./AssistMenu";
import { buildTargetPrompt, writeLabel, type AssistAction, type AssistTarget } from "@/lib/ai/targets";
import { genKindFor, type StructuredPatch } from "@/lib/ai/structured";
import { DownloadDialog } from "./DownloadDialog";
import { HelpDialog, SECTION_KEYS } from "./HelpDialog";
import { ListEditor } from "./ListEditor";
import { MetaForm } from "./MetaForm";
import { Preview } from "./Preview";
import { FullscreenPreview } from "./FullscreenPreview";
import { useHistory } from "./useHistory";
import { SaveIndicator, useSaver } from "./useSaver";
import {
  IconBack,
  IconCards,
  IconChevron,
  IconDownload,
  IconExpand,
  IconHelp,
  IconLink,
  IconNext,
  IconPresent,
  IconPrev,
  IconRedo,
  IconSparkle,
  IconTrash,
  IconUndo,
  IconUpload,
  IconWand,
} from "./icons";

const META_KEYS: (keyof Meta)[] = ["nom", "theme", "numero", "bloc", "date", "auteur", "groupe", "lien"];

type DocState = { id: string; content: Content; overrides: MetaPatch };
interface EditorState {
  base: Meta;
  docs: Record<DocType, DocState>;
}

interface Props {
  prosit: PrositRow;
  documents: DocumentRow[];
  settings: Settings;
}

/** Contenu non vide ? (pour savoir si une rubrique est remplie) */
function filled(v: Content[string] | undefined): boolean {
  if (typeof v === "string") return v.trim() !== "";
  return Array.isArray(v) && v.some((i) => i.text.trim() !== "");
}

export function Editor({ prosit: initialProsit, documents, settings: initialSettings }: Props) {
  // réglages vivants : le changement de mise en page s'applique tout de suite à l'aperçu
  const [settings, setSettings] = useState(initialSettings);
  const changeStyle = async (docStyle: DocStyle) => {
    const next: Settings = { ...settings, docStyle, docFont: DOC_STYLES[docStyle].font };
    setSettings(next);
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(next) });
    } catch (e) {
      setNotice(`Mise en page non enregistrée : ${(e as Error).message}`);
    }
  };
  const router = useRouter();
  const search = useSearchParams();
  const prositId = initialProsit.id;
  const [tab, setTab] = useState<DocType>(search.get("tab") === "retour" ? "retour" : "aller");
  const [mobileView, setMobileView] = useState<"form" | "preview">("form");
  const [metaOpen, setMetaOpen] = useState(true);
  const [download, setDownload] = useState<"docx" | "pdf" | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const closeFullscreen = useCallback(() => setFullscreen(false), []);
  const [helpOpen, setHelpOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);
  const navLock = useRef(0);

  const history = useHistory<EditorState>(() => {
    const docs = {} as Record<DocType, DocState>;
    for (const d of documents) docs[d.type] = { id: d.id, content: coerceContent(getTemplate(d.type), d.content), overrides: d.metaOverrides };
    return { base: Object.fromEntries(META_KEYS.map((k) => [k, initialProsit[k] ?? ""])) as Meta, docs };
  });
  const { base, docs } = history.state;
  const { schedule, flush, retry, status, error } = useSaver();

  const doc = docs[tab];
  // Retour : ce qui est affiché / exporté = retour fusionné avec l'aller (sans toucher aux données saisies)
  const merged = useMemo(
    () => (tab === "retour" ? mergeAllerIntoRetour(docs.aller.content, doc.content) : { content: doc.content, added: 0 }),
    [tab, docs.aller.content, doc.content],
  );
  // aperçu = exactement ce qui sera exporté : contenu fusionné puis mis en forme (fonction pure)
  const renderContent = useMemo(() => formatProsit(merged.content, tab), [merged.content, tab]);
  const template = getTemplate(tab);
  const sectionNums = sectionNumbers(template);
  const meta = useMemo(() => effectiveMeta(base, tab, tab === "retour" ? doc.overrides : null), [base, tab, doc.overrides]);
  const filename = buildFilename(settings.filenameTemplate, meta, tab);

  /** Entrées de navigation : en-tête puis chaque section du template. */
  const navItems = useMemo(
    () => [
      { label: "En-tête", num: undefined as string | undefined, done: !!(meta.numero && meta.theme) },
      ...template.sections.map((s, i) => ({
        label: s.title,
        num: sectionNums[i] ? toRoman(sectionNums[i]!) : undefined,
        done: s.fields.some((f) => filled(doc.content[f.key])),
      })),
    ],
    [template, sectionNums, doc.content, meta.numero, meta.theme],
  );

  // ---------- persistance (diff entre deux états) ----------

  const persist = useCallback(
    (next: EditorState, prev: EditorState) => {
      if (next.base !== prev.base) {
        const body = JSON.stringify(next.base);
        schedule("prosit", () => saveApi(`/api/prosits/${prositId}`, { method: "PATCH", body }));
      }
      for (const type of ["aller", "retour"] as const) {
        const a = next.docs[type];
        const b = prev.docs[type];
        if (a.content !== b.content) {
          const body = JSON.stringify({ content: a.content });
          schedule(`content:${a.id}`, () => saveApi(`/api/documents/${a.id}`, { method: "PATCH", body }));
        }
        if (a.overrides !== b.overrides) {
          const body = JSON.stringify({ metaOverrides: a.overrides });
          schedule(`meta:${a.id}`, () => saveApi(`/api/documents/${a.id}`, { method: "PATCH", body }));
        }
      }
    },
    [prositId, schedule],
  );

  const update = (fn: (s: EditorState) => EditorState, group?: string) => {
    const prev = history.get();
    const next = fn(prev);
    history.commit(next, group);
    persist(next, prev);
  };

  const undo = useCallback(() => {
    const prev = history.get();
    const next = history.undo();
    if (next) persist(next, prev);
  }, [history, persist]);

  const redo = useCallback(() => {
    const prev = history.get();
    const next = history.redo();
    if (next) persist(next, prev);
  }, [history, persist]);

  const setDoc = (type: DocType, patch: Partial<DocState>, group?: string) =>
    update((s) => ({ ...s, docs: { ...s.docs, [type]: { ...s.docs[type], ...patch } } }), group);

  const setField = (key: string, value: Content[string]) => setDoc(tab, { content: { ...doc.content, [key]: value } }, `${tab}:${key}`);

  const setMeta = (key: keyof Meta, value: string) => {
    if (tab === "aller") update((s) => ({ ...s, base: { ...s.base, [key]: value } }), `meta:${key}`);
    else setDoc("retour", { overrides: { ...doc.overrides, [key]: value } }, `override:${key}`);
  };

  const resetMeta = (key: keyof Meta) => {
    const next = { ...doc.overrides };
    delete next[key];
    setDoc("retour", { overrides: next });
  };

  const resetProsit = () => {
    if (!confirm(`Vider toutes les rubriques du prosit ${tab} ?\nL’en-tête est conservé. Tu peux annuler avec Ctrl+Z.`)) return;
    setDoc(tab, { content: emptyContent(template) });
    setNotice(`Prosit ${tab} réinitialisé. Ctrl+Z pour annuler.`);
  };

  /** Ajoute au retour ce qui manque par rapport à l'aller (sans rien écraser). */
  const syncFromAller = (auto = false) => {
    const s = history.get();
    const { content, added } = mergeAllerIntoRetour(s.docs.aller.content, s.docs.retour.content);
    if (!added) {
      if (!auto) setNotice("Le retour contient déjà tous les éléments de l’aller.");
      return;
    }
    setDoc("retour", { content });
    setNotice(
      auto
        ? "Le retour a été pré-rempli avec le contenu de l’aller : ajoute les définitions et les statuts des pistes (Ctrl+Z pour annuler)."
        : `${added} élément(s) de l’aller ajouté(s) au retour (Ctrl+Z pour annuler).`,
    );
  };

  // Premier passage sur un retour vide : on le pré-remplit avec l'aller.
  const autoSynced = useRef(false);
  useEffect(() => {
    if (tab !== "retour" || autoSynced.current) return;
    autoSynced.current = true;
    const s = history.get();
    if (isContentEmpty(s.docs.retour.content) && !isContentEmpty(s.docs.aller.content)) syncFromAller(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const switchTab = (t: DocType) => {
    setTab(t);
    setActive(0);
    router.replace(`?tab=${t}`, { scroll: false });
  };

  // ---------- assistant IA ----------

  /** Rubrique en cours, telle que vue par l'assistant (null pour l'en-tête et les rôles). */
  const focus = useMemo<FocusSection | null>(() => {
    const s = active > 0 ? template.sections[active - 1] : undefined;
    const fields = (s?.fields ?? []).flatMap((f): FocusField[] =>
      f.kind === "role" ? [] : [{ key: f.key, label: f.label, kind: f.kind, withDetail: f.kind === "list" && !!f.detail }],
    );
    return s && fields.length ? { title: s.title, fields } : null;
  }, [active, template]);

  const assistantApi = useRef<AssistantApi | null>(null);

  /** Bouton de l'assistant d'un élément ou d'un champ : ouvre le panneau et envoie la demande ciblée. */
  const assistTarget = (target: AssistTarget, action: AssistAction) => {
    setAssistantOpen(true);
    // « Rédiger » un élément : réponse JSON structurée (définition, justification, élément du plan)
    if (action === "write" && target.kind === "item" && target.gen) {
      assistantApi.current?.generate(`${writeLabel(target)} · ${target.text.length > 60 ? target.text.slice(0, 59) + "…" : target.text}`, target);
      return;
    }
    const { prompt, label } = buildTargetPrompt(target, action);
    assistantApi.current?.ask(prompt, label, target);
  };

  /** Mise en forme déterministe d'une seule rubrique (après une génération ou une insertion). */
  const formatField = (type: DocType, content: Content, key: string): Content => ({ ...content, [key]: formatProsit(content, type)[key] });

  /** Bouton « Mettre en forme » : formateur déterministe sur tout le document (annulable). */
  const formatDocument = () => {
    const content = history.get().docs[tab].content;
    const next = formatProsit(content, tab);
    const n = countChanges(content, next);
    if (!n) {
      setNotice("Rien à mettre en forme : le document est déjà propre.");
      return;
    }
    setDoc(tab, { content: next });
    setNotice(`Mise en forme appliquée à ${n} rubrique${n > 1 ? "s" : ""} (Ctrl+Z pour annuler).`);
  };

  /** Applique la réponse de l'assistant à l'élément / au champ visé (annulable). */
  const applyToTarget = (target: AssistTarget, patch: StructuredPatch) => {
    const content = history.get().docs[target.tab].content;
    const current = content[target.fieldKey];
    if (target.kind === "field") {
      if (patch.text === undefined) return;
      setDoc(target.tab, { content: { ...content, [target.fieldKey]: patch.text } });
    } else {
      if (!Array.isArray(current) || !current.some((i) => i.id === target.itemId)) {
        setNotice("L’élément visé n’existe plus : copie la proposition à la main.");
        return;
      }
      const { text, ...rest } = patch;
      const defined = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      const next = current.map((i) => (i.id === target.itemId ? { ...i, ...(text !== undefined && text.trim() ? { text: text.replace(/\s*\n\s*/g, " ") } : {}), ...defined } : i));
      // mise en forme déterministe de la rubrique juste après la génération
      setDoc(target.tab, { content: formatField(target.tab, { ...content, [target.fieldKey]: next }, target.fieldKey) });
    }
    setNotice(`Proposition appliquée à « ${target.kind === "item" ? target.text : target.fieldLabel} » (Ctrl+Z pour annuler).`);
  };

  const insertFromAssistant = (field: FocusField, text: string, mode: "append" | "replace") => {
    const current = history.get().docs[tab].content[field.key];
    let value: Content[string];
    if (field.kind === "list") {
      const items = textToListItems(text, { withDetail: field.withDetail, newId: newItemId });
      const kept = mode === "append" && Array.isArray(current) ? current.filter((i) => i.text.trim() !== "") : [];
      value = [...kept, ...items];
    } else {
      const add = textForTextField(text);
      value = mode === "append" && typeof current === "string" && current.trim() ? `${current.trimEnd()}
${add}` : add;
    }
    setDoc(tab, { content: formatField(tab, { ...history.get().docs[tab].content, [field.key]: value }, field.key) });
    setNotice(`Proposition de l’assistant ${mode === "append" ? "ajoutée à" : "mise à la place de"} « ${field.label} » (Ctrl+Z pour annuler).`);
  };

  // ---------- navigation entre rubriques ----------

  /** Fait défiler l'aperçu (colonne de droite, défilable en grand écran) jusqu'à la rubrique idx. */
  const scrollPreviewTo = (idx: number) => {
    const box = previewRef.current;
    if (!box || box.scrollHeight <= box.clientHeight) return; // aperçu masqué ou non défilable (mobile)
    const target = idx === 0 ? null : box.querySelector<HTMLElement>(`[data-preview-nav="${idx}"]`);
    const top = target ? target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12 : 0;
    box.scrollTo({ top, behavior: "smooth" });
  };

  const goTo = useCallback(
    (i: number) => {
      const idx = Math.max(0, Math.min(navItems.length - 1, i));
      setMobileView("form");
      if (idx === 0) setMetaOpen(true);
      setActive(idx);
      // Pendant le défilement animé, le suivi au scroll ne doit pas remplacer la rubrique choisie.
      navLock.current = Date.now() + 900;
      // setTimeout (et non requestAnimationFrame) : laisse React afficher l'en-tête déplié avant de viser le champ
      setTimeout(() => {
        const el = sectionRefs.current[idx];
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
        scrollPreviewTo(idx);
      }, 0);
    },
    [navItems.length],
  );

  // rubrique visible à l'écran → active
  useEffect(() => {
    const els = sectionRefs.current.filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver(
      (entries) => {
        // Si l'utilisateur écrit dans une rubrique, c'est elle qui reste active (suivie via onFocusCapture).
        if (document.activeElement?.closest("[data-nav]")) return;
        if (Date.now() < navLock.current) return;
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const i = visible ? Number((visible.target as HTMLElement).dataset.nav) : NaN;
        if (!Number.isNaN(i)) setActive(i);
      },
      { rootMargin: "-160px 0px -55% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [tab, navItems.length]);

  // ---------- présentation (fenêtre séparée) ----------

  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(channelName(prositId));
    channel.current = ch;
    return () => {
      ch.close();
      channel.current = null;
    };
  }, [prositId]);

  const presentationState: PresentationMessage = useMemo(() => ({ kind: "state", tab, meta, content: renderContent, active }), [tab, meta, renderContent, active]);
  useEffect(() => {
    channel.current?.postMessage(presentationState);
  }, [presentationState]);
  useEffect(() => {
    const ch = channel.current;
    if (!ch) return;
    const onMsg = (e: MessageEvent<PresentationMessage>) => {
      if (e.data?.kind === "hello") ch.postMessage(presentationState);
    };
    ch.addEventListener("message", onMsg);
    return () => ch.removeEventListener("message", onMsg);
  }, [presentationState]);

  /** Révision (cartes) : enregistre d'abord, les cartes sont lues depuis la base. */
  const openRevision = async () => {
    await flush().catch(() => undefined);
    router.push(`/prosits/${prositId}/revision`);
  };

  const openPresentation = () => {
    window.open(`/prosits/${prositId}/presentation?tab=${tab}`, `presentation-${prositId}`, "popup,width=1280,height=800");
  };

  // ---------- raccourcis clavier ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]") && e.key !== "F1") return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === "F1") {
        e.preventDefault();
        setHelpOpen((o) => !o);
      } else if (ctrl && !e.altKey && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (ctrl && !e.altKey && k === "y") {
        e.preventDefault();
        redo();
      } else if (ctrl && !e.altKey && k === "s") {
        e.preventDefault();
        setDownload("docx");
      } else if (ctrl && e.key === "Enter") {
        e.preventDefault();
        goTo(active + (e.shiftKey ? -1 : 1));
      } else if (ctrl && e.altKey && k === "l") {
        e.preventDefault();
        void toggleColorMode();
      } else if (e.altKey && e.shiftKey && !ctrl) {
        const idx = SECTION_KEYS.indexOf(e.key.toUpperCase());
        if (idx >= 0 && idx < navItems.length) {
          e.preventDefault();
          goTo(idx);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, goTo, navItems.length, undo, redo]);

  // ---------- import d'un .docx ----------

  async function importFile(file: File) {
    setNotice(null);
    try {
      // l'onglet ouvert et le nom du fichier ne sont que des indices : le type lu dans le document l'emporte
      const hint: DocType = /retour|cer/i.test(file.name) ? "retour" : /aller/i.test(file.name) ? "aller" : tab;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", hint);
      const r = await api<{ type: DocType | null; content: Content; meta: MetaPatch; unmatched: string[] }>("/api/import", { method: "POST", body: fd });
      const target: DocType = r.type ?? hint;

      // fusion (jamais de remplacement) dans le bon document ; l'autre n'est pas touché,
      // sauf un aller vide qu'un retour importé permet de reconstituer
      let stats: ImportMergeStats = { added: 0, enriched: 0, kept: [] };
      let allerRebuilt = false;
      update((s) => {
        const merged = mergeImported(target, s.docs[target].content, r.content);
        stats = merged.stats;
        const docs = { ...s.docs, [target]: { ...s.docs[target], content: merged.content } };
        if (target === "retour" && isContentEmpty(s.docs.aller.content)) {
          docs.aller = { ...s.docs.aller, content: retourToAller(r.content) };
          allerRebuilt = true;
        }
        const next: EditorState = { ...s, docs };
        const fill: MetaPatch = {};
        if (r.meta.numero && !s.base.numero) fill.numero = r.meta.numero;
        if (r.meta.theme && !s.base.theme) fill.theme = r.meta.theme;
        if (Object.keys(fill).length) next.base = { ...s.base, ...fill };
        return next;
      });
      if (target !== tab) switchTab(target);

      const parts = [
        `${stats.added} ajout(s)`,
        `${stats.enriched} élément(s) complété(s)`,
        ...(stats.kept.length ? [`conservé(s) car déjà rempli(s) différemment : ${stats.kept.join(", ")}`] : []),
      ];
      setNotice(
        `« ${file.name} » fusionné dans le prosit ${target} : ${parts.join(" · ")}.` +
          (target !== tab ? ` (fichier détecté comme prosit ${target} : l’onglet ${tab} n’a pas été modifié)` : "") +
          (allerRebuilt ? " L’aller, vide, a été reconstitué à partir du retour." : "") +
          (r.unmatched.length ? ` Rubriques non reconnues : ${r.unmatched.join(", ")}.` : "") +
          " Ctrl+Z pour annuler.",
      );
    } catch (e) {
      setNotice(`Import impossible : ${(e as Error).message}`);
    }
  }

  // ---------- rendu ----------

  const lienOk = /^https?:\/\//i.test(base.lien);
  const navButton = (i: number, compact = false) => {
    const n = navItems[i];
    return (
      <button
        key={i}
        onClick={() => goTo(i)}
        aria-current={active === i ? "step" : undefined}
        className={
          compact
            ? `shrink-0 rounded-sm border px-2.5 py-1 text-xs whitespace-nowrap ${active === i ? "border-ink bg-ink text-bg" : "border-line text-muted"}`
            : `flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm ${active === i ? "bg-accent/25 font-semibold text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"}`
        }
      >
        {!compact && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${n.done ? "bg-emerald-500" : "bg-line"}`} />}
        {n.num && <span className={compact ? "" : "w-7 shrink-0 font-mono text-xs"}>{n.num}</span>}
        <span className="truncate">{n.label}</span>
      </button>
    );
  };

  return (
    <main className="mx-auto max-w-[1700px] px-3 pb-16 sm:px-4">
      {/* Barre d'outils */}
      <div className="z-20 -mx-3 mb-4 border-b border-line bg-bg/95 px-3 py-3 backdrop-blur sm:sticky sm:top-14 sm:-mx-4 sm:px-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link href="/" className="btn btn-ghost btn-icon" aria-label="Retour à la liste" title="Retour à la liste">
            <IconBack />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="title-cesi truncate text-lg leading-tight sm:text-xl">{prositTitle(meta).title}</h1>
            <p className="truncate text-xs text-muted">{meta.theme || "Thème non renseigné"}</p>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted" title="Style du document (aperçu, Word et PDF)">
            <span className="hidden xl:inline">Mise en page</span>
            <select
              className="field w-auto py-1 pr-7 text-xs"
              value={settings.docStyle ?? "cesi"}
              onChange={(e) => void changeStyle(e.target.value as DocStyle)}
              aria-label="Mise en page du document"
            >
              {(Object.keys(DOC_STYLES) as DocStyle[]).map((k) => (
                <option key={k} value={k}>
                  {DOC_STYLES[k].label}
                </option>
              ))}
            </select>
          </label>
          <SaveIndicator status={status} error={error} onRetry={retry} />
          <div className="flex items-center gap-0.5">
            <button className="btn btn-ghost btn-icon" onClick={undo} disabled={!history.canUndo} title="Annuler (Ctrl+Z)" aria-label="Annuler">
              <IconUndo />
            </button>
            <button className="btn btn-ghost btn-icon" onClick={redo} disabled={!history.canRedo} title="Rétablir (Ctrl+Maj+Z)" aria-label="Rétablir">
              <IconRedo />
            </button>
            {lienOk && (
              <a className="btn btn-ghost btn-icon" href={base.lien} target="_blank" rel="noopener noreferrer" title="Ouvrir le sujet" aria-label="Ouvrir le sujet">
                <IconLink />
              </a>
            )}
            <button className="btn btn-ghost btn-icon" onClick={() => setHelpOpen(true)} title="Aide et raccourcis (F1)" aria-label="Aide">
              <IconHelp />
            </button>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <button className={`btn ${assistantOpen ? "border-ink" : ""}`} onClick={() => setAssistantOpen((o) => !o)} title="Assistant de rédaction (Perplexity)" aria-pressed={assistantOpen}>
              <IconSparkle /> <span className="hidden md:inline">Assistant</span>
            </button>
            <button className="btn" onClick={formatDocument} title="Mise en forme automatique : nettoie le texte, structure le plan d’action, fusionne les doublons (Ctrl+Z pour annuler)">
              <IconWand /> <span className="hidden md:inline">Mettre en forme</span>
            </button>
            <button className="btn" onClick={openPresentation} title="Ouvrir la vue à projeter">
              <IconPresent /> <span className="hidden md:inline">Présentation</span>
            </button>
            <button className="btn" onClick={openRevision} title="Réviser le prosit retour avec des cartes (mots clés, notions, questions…)">
              <IconCards /> <span className="hidden md:inline">Réviser</span>
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()} title="Pré-remplir depuis un .docx existant">
              <IconUpload /> <span className="hidden md:inline">Importer</span>
            </button>
            <button className="btn btn-primary flex-1 justify-center sm:flex-none" onClick={() => setDownload("docx")} title="Ctrl+S">
              <IconDownload /> Word <span className="hidden lg:inline">(.docx)</span>
            </button>
            <button className="btn btn-primary flex-1 justify-center sm:flex-none" onClick={() => setDownload("pdf")}>
              <IconDownload /> PDF
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) importFile(f);
            }}
          />
        </div>
        {/* Onglets Aller / Retour */}
        <div className="mt-3 flex items-end gap-1 border-b border-line" role="tablist">
          {(["aller", "retour"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => switchTab(t)}
              className={`title-cesi -mb-px whitespace-nowrap border-b-[3px] px-4 py-1.5 text-sm ${tab === t ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              <span className="hidden sm:inline">Prosit </span>
              {t}
            </button>
          ))}
          <div className="ml-auto flex gap-1 pb-1 lg:hidden" role="group" aria-label="Affichage">
            {(["form", "preview"] as const).map((v) => (
              <button key={v} onClick={() => setMobileView(v)} className={`rounded-sm px-2.5 py-1 text-xs ${mobileView === v ? "bg-ink text-bg" : "text-muted"}`}>
                {v === "form" ? "Formulaire" : "Aperçu"}
              </button>
            ))}
          </div>
        </div>
        {/* Navigation compacte (écrans < xl) */}
        <nav className="-mx-1 mt-2 flex items-center gap-1 overflow-x-auto px-1 pb-0.5 xl:hidden" aria-label="Rubriques">
          <button className="btn btn-ghost btn-icon shrink-0" onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Rubrique précédente">
            <IconPrev width={14} height={14} />
          </button>
          {navItems.map((_, i) => navButton(i, true))}
          <button className="btn btn-ghost btn-icon shrink-0" onClick={() => goTo(active + 1)} disabled={active === navItems.length - 1} aria-label="Rubrique suivante">
            <IconNext width={14} height={14} />
          </button>
        </nav>
      </div>

      {notice && (
        <p className="mb-4 flex items-start gap-2 rounded-sm border border-line bg-surface px-3 py-2 text-sm">
          <span className="flex-1">{notice}</span>
          <button className="text-muted hover:text-ink" onClick={() => setNotice(null)} aria-label="Fermer">×</button>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)]">
        {/* Barre latérale (xl) */}
        <aside className="hidden xl:block">
          <nav className="sticky top-[10.5rem] space-y-0.5" aria-label="Rubriques">
            {navItems.map((_, i) => navButton(i))}
            <div className="flex gap-1 pt-3">
              <button className="btn flex-1 justify-center text-xs" onClick={() => goTo(active - 1)} disabled={active === 0} title="Ctrl+Maj+Entrée">
                <IconPrev width={14} height={14} /> Préc.
              </button>
              <button className="btn flex-1 justify-center text-xs" onClick={() => goTo(active + 1)} disabled={active === navItems.length - 1} title="Ctrl+Entrée">
                Suiv. <IconNext width={14} height={14} />
              </button>
            </div>
            <button className="btn btn-ghost mt-4 w-full justify-center text-xs text-danger" onClick={resetProsit}>
              <IconTrash width={14} height={14} /> Réinitialiser le prosit
            </button>
          </nav>
        </aside>

        {/* Formulaire */}
        <div className={`space-y-4 ${mobileView === "preview" ? "hidden lg:block" : ""}`}>
          <section
            ref={(el) => {
              sectionRefs.current[0] = el;
            }}
            data-nav={0}
            onFocusCapture={() => setActive(0)}
            className={`scroll-mt-48 rounded-sm border bg-surface ${active === 0 ? "border-ink/40" : "border-line"}`}
          >
            <button className="flex w-full items-center gap-2 px-4 py-3 text-left" onClick={() => setMetaOpen((o) => !o)} aria-expanded={metaOpen}>
              <span className="title-cesi text-sm">En-tête du prosit</span>
              <span className="truncate text-xs text-muted">{!metaOpen && [meta.numero && `n° ${meta.numero}`, meta.auteur, meta.groupe].filter(Boolean).join(" · ")}</span>
              <IconChevron className={`ml-auto shrink-0 transition-transform ${metaOpen ? "rotate-180" : ""}`} />
            </button>
            {metaOpen && (
              <div className="border-t border-line px-4 py-4">
                <MetaForm type={tab} meta={meta} overrides={tab === "retour" ? doc.overrides : null} onChange={setMeta} onReset={resetMeta} />
              </div>
            )}
          </section>

          {tab === "retour" && (
            <div className="flex flex-wrap items-center gap-3 rounded-sm border border-dashed border-line bg-surface px-4 py-3 text-xs text-muted">
              <p className="min-w-0 flex-1">
                Le retour est une <strong className="text-ink">fusion de l’aller</strong> enrichie : ajoute une <strong className="text-ink">définition</strong> sous
                chaque élément et un <strong className="text-ink">statut</strong> à chaque piste (vert = validée, orange = partielle, rouge = non validée).
                {merged.added > 0 && (
                  <>
                    {" "}
                    <span className="text-ink">
                      {merged.added} élément(s) de l’aller absent(s) ici sont déjà fusionnés dans l’aperçu et l’export.
                    </span>
                  </>
                )}
              </p>
              <button
                className="btn text-xs"
                onClick={() => syncFromAller()}
                title="Copie dans le formulaire du retour les éléments de l’aller qui manquent (pour les compléter), sans rien effacer"
              >
                Reprendre depuis l’aller{merged.added > 0 ? ` (${merged.added})` : ""}
              </button>
            </div>
          )}

          {template.sections.map((s, si) => {
            const n = sectionNums[si];
            const isRoles = s.fields.every((f) => f.kind === "role");
            const navIdx = si + 1;
            return (
              <section
                key={`${tab}:${s.title}`}
                ref={(el) => {
                  sectionRefs.current[navIdx] = el;
                }}
                data-nav={navIdx}
                onFocusCapture={() => setActive(navIdx)}
                className={`scroll-mt-48 rounded-sm border bg-surface px-4 py-4 transition-colors ${active === navIdx ? "border-ink/40" : "border-line"}`}
              >
                <h2 className="title-cesi mb-3 text-base">
                  {n && <span className="mr-2 text-muted">{toRoman(n)}</span>}
                  <span className="underline-accent">{s.title}</span>
                </h2>
                <div className={isRoles ? "grid gap-3 sm:grid-cols-2" : "space-y-4"}>
                  {s.fields.map((f) => (
                    <FieldEditor
                      key={`${tab}:${f.key}`}
                      field={f}
                      value={doc.content[f.key]}
                      onChange={(v) => setField(f.key, v)}
                      assistContext={{ tab, section: s.title }}
                      onAssist={assistTarget}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          <div className="flex gap-2 xl:hidden">
            <button className="btn btn-ghost flex-1 justify-center text-xs text-danger" onClick={resetProsit}>
              <IconTrash width={14} height={14} /> Réinitialiser le prosit {tab}
            </button>
          </div>
        </div>

        {/* Aperçu */}
        <div className={`${mobileView === "form" ? "hidden lg:block" : ""}`}>
          <div ref={previewRef} className="lg:sticky lg:top-[11.5rem] lg:max-h-[calc(100dvh-12.5rem)] lg:overflow-auto xl:top-[10.5rem] xl:max-h-[calc(100dvh-11.5rem)]">
            {/* en-tête collé en haut de la zone d'aperçu : le bouton Plein écran reste visible au défilement */}
            <div className="z-10 mb-2 flex items-center lg:sticky lg:top-0 gap-2 bg-[var(--bg)] py-1 text-xs text-muted">
              <p className="min-w-0 flex-1 truncate">
                Aperçu · <code>{filename}.docx</code>
              </p>
              <button className="btn btn-ghost shrink-0 px-2 py-1 text-xs" onClick={() => setFullscreen(true)} title="Aperçu ou PDF en plein écran">
                <IconExpand width={14} height={14} /> Plein écran
              </button>
            </div>
            <Preview meta={meta} type={tab} content={renderContent} settings={settings} />
          </div>
        </div>
      </div>

      {fullscreen && (
        <FullscreenPreview
          meta={meta}
          type={tab}
          content={renderContent}
          settings={settings}
          documentId={doc.id}
          filename={filename}
          beforePdf={flush}
          onClose={closeFullscreen}
        />
      )}

      <AssistantPanel
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        prositId={prositId}
        tab={tab}
        initialLinks={initialProsit.liensAide}
        focus={focus}
        beforeAsk={flush}
        onInsert={insertFromAssistant}
        onApply={applyToTarget}
        apiRef={assistantApi}
      />

      {download && (
        <DownloadDialog open format={download} defaultName={filename} documentId={doc.id} beforeDownload={flush} onClose={() => setDownload(null)} />
      )}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} sections={navItems.map((n) => (n.num ? `${n.num} ${n.label}` : n.label))} />
    </main>
  );
}

function FieldEditor({
  field,
  value,
  onChange,
  assistContext,
  onAssist,
}: {
  field: FieldDef;
  value: Content[string];
  onChange: (v: Content[string]) => void;
  assistContext: { tab: DocType; section: string };
  onAssist: (target: AssistTarget, action: AssistAction) => void;
}) {
  const id = `f-${field.key}`;
  if (field.kind === "role") {
    return (
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{field.label}</span>
        <input className="field" value={typeof value === "string" ? value : ""} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  return (
    <div>
      {field.heading && (
        <label htmlFor={field.kind === "text" ? id : undefined} className="mb-1.5 block text-sm font-semibold">
          {field.label}
        </label>
      )}
      {field.kind === "text" ? (
        <TextFieldWithAssist field={field} id={id} value={typeof value === "string" ? value : ""} onChange={onChange} assistContext={assistContext} onAssist={onAssist} />
      ) : (
        <ListEditor
          label={field.label}
          items={Array.isArray(value) ? (value as ListItem[]) : []}
          style={field.style}
          placeholder={field.placeholder}
          onChange={onChange}
          detailLabel={field.detail}
          withStatus={field.status}
          rich={field.rich}
          plan={field.plan}
          onAssist={(item, action) =>
            onAssist(
              {
                kind: "item",
                ...assistContext,
                fieldKey: field.key,
                fieldLabel: field.label,
                itemId: item.id,
                text: item.text,
                detail: item.detail,
                detailLabel: field.plan ? "l’élément du plan" : field.detail,
                gen: genKindFor(field) ?? undefined,
                ...(field.plan ? { existing: { description: item.description, points: item.points, etapes: item.etapes, interet: item.interet } } : {}),
              },
              action,
            )
          }
        />
      )}
    </div>
  );
}

function TextFieldWithAssist({
  field,
  id,
  value,
  onChange,
  assistContext,
  onAssist,
}: {
  field: FieldDef;
  id: string;
  value: string;
  onChange: (v: string) => void;
  assistContext: { tab: DocType; section: string };
  onAssist: (target: AssistTarget, action: AssistAction) => void;
}) {
  const target: AssistTarget = { kind: "field", ...assistContext, fieldKey: field.key, fieldLabel: field.label, text: value };
  return (
    <div className="relative">
      <textarea
        id={id}
        className="field min-h-24 resize-y pr-9 leading-relaxed"
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={field.key === "contenu" ? 16 : 4}
      />
      <AssistMenu
        className="absolute top-1 right-1"
        title={`Assistant : corriger ou rédiger « ${field.label} »`}
        items={[
          { label: "Corriger les fautes", onSelect: () => onAssist(target, "fix"), disabled: !value.trim() },
          { label: "Améliorer la rédaction", onSelect: () => onAssist(target, "improve"), disabled: !value.trim() },
          { label: writeLabel(target), onSelect: () => onAssist(target, "write") },
        ]}
      />
    </div>
  );
}
