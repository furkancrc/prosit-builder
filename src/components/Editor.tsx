"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { DocumentRow, PrositRow } from "@/lib/db";
import { api } from "@/lib/client-api";
import { buildFilename } from "@/lib/filename";
import { effectiveMeta } from "@/lib/meta";
import type { Content, DocType, ListItem, Meta, MetaPatch, Settings } from "@/lib/schema";
import { coerceContent, getTemplate, sectionNumbers, type FieldDef } from "@/lib/templates";
import { toRoman } from "@/lib/doc-model";
import { DownloadDialog } from "./DownloadDialog";
import { ListEditor } from "./ListEditor";
import { MetaForm } from "./MetaForm";
import { Preview } from "./Preview";
import { SaveIndicator, useSaver } from "./useSaver";
import { IconBack, IconChevron, IconDownload, IconUpload } from "./icons";

const META_KEYS: (keyof Meta)[] = ["nom", "theme", "numero", "bloc", "date", "auteur", "groupe"];

interface Props {
  prosit: PrositRow;
  documents: DocumentRow[];
  settings: Settings;
}

export function Editor({ prosit: initialProsit, documents, settings }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const [tab, setTab] = useState<DocType>(search.get("tab") === "retour" ? "retour" : "aller");
  const [mobileView, setMobileView] = useState<"form" | "preview">("form");
  const [metaOpen, setMetaOpen] = useState(true);
  const [download, setDownload] = useState<"docx" | "pdf" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [base, setBase] = useState<Meta>(() => Object.fromEntries(META_KEYS.map((k) => [k, initialProsit[k]])) as Meta);
  const [docs, setDocs] = useState(() => {
    const m = {} as Record<DocType, { id: string; content: Content; overrides: MetaPatch }>;
    for (const d of documents) m[d.type] = { id: d.id, content: coerceContent(getTemplate(d.type), d.content), overrides: d.metaOverrides };
    return m;
  });
  const { schedule, flush, status, error } = useSaver();

  const doc = docs[tab];
  const template = getTemplate(tab);
  const sectionNums = sectionNumbers(template);
  const meta = useMemo(() => effectiveMeta(base, tab, tab === "retour" ? doc.overrides : null), [base, tab, doc.overrides]);
  const filename = buildFilename(settings.filenameTemplate, meta, tab);

  const switchTab = (t: DocType) => {
    setTab(t);
    router.replace(`?tab=${t}`, { scroll: false });
  };

  // ---------- mises à jour + sauvegarde automatique ----------

  const saveDoc = (type: DocType, next: { content?: Content; overrides?: MetaPatch }) => {
    const id = docs[type].id;
    setDocs((d) => ({ ...d, [type]: { ...d[type], ...(next.content && { content: next.content }), ...(next.overrides && { overrides: next.overrides }) } }));
    if (next.content) {
      const content = next.content;
      schedule(`content:${id}`, () => api(`/api/documents/${id}`, { method: "PATCH", body: JSON.stringify({ content }) }));
    }
    if (next.overrides) {
      const metaOverrides = next.overrides;
      schedule(`meta:${id}`, () => api(`/api/documents/${id}`, { method: "PATCH", body: JSON.stringify({ metaOverrides }) }));
    }
  };

  const setField = (key: string, value: Content[string]) => saveDoc(tab, { content: { ...doc.content, [key]: value } });

  const setMeta = (key: keyof Meta, value: string) => {
    if (tab === "aller") {
      const next = { ...base, [key]: value };
      setBase(next);
      schedule("prosit", () => api(`/api/prosits/${initialProsit.id}`, { method: "PATCH", body: JSON.stringify(next) }));
    } else {
      saveDoc("retour", { overrides: { ...doc.overrides, [key]: value } });
    }
  };

  const resetMeta = (key: keyof Meta) => {
    const next = { ...doc.overrides };
    delete next[key];
    saveDoc("retour", { overrides: next });
  };

  // ---------- import d'un .docx ----------

  async function importFile(file: File) {
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", tab);
      const r = await api<{ content: Content; meta: MetaPatch; unmatched: string[] }>("/api/import", { method: "POST", body: fd });
      const hasContent = Object.values(doc.content).some((v) => (typeof v === "string" ? v.trim() : v.length));
      if (hasContent && !confirm(`Remplacer le contenu actuel du prosit ${tab} par celui de « ${file.name} » ?`)) return;
      saveDoc(tab, { content: coerceContent(template, r.content) });
      if (tab === "aller") {
        const fill: MetaPatch = {};
        if (r.meta.numero && !meta.numero) fill.numero = r.meta.numero;
        if (r.meta.theme && !meta.theme) fill.theme = r.meta.theme;
        if (Object.keys(fill).length) {
          const next = { ...base, ...fill };
          setBase(next);
          schedule("prosit", () => api(`/api/prosits/${initialProsit.id}`, { method: "PATCH", body: JSON.stringify(next) }));
        }
      }
      setNotice(
        `Import de « ${file.name} » terminé.` + (r.unmatched.length ? ` Rubriques non reconnues : ${r.unmatched.join(", ")}.` : ""),
      );
    } catch (e) {
      setNotice(`Import impossible : ${(e as Error).message}`);
    }
  }

  // ---------- rendu ----------

  return (
    <main className="mx-auto max-w-[1600px] px-3 pb-16 sm:px-4">
      {/* Barre d'outils */}
      <div className="z-20 -mx-3 sm:sticky sm:top-14 mb-4 border-b border-line bg-bg/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link href="/" className="btn btn-ghost btn-icon" aria-label="Retour à la liste" title="Retour à la liste">
            <IconBack />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="title-cesi truncate text-lg leading-tight sm:text-xl">{meta.nom || "Sans nom"}</h1>
            <p className="truncate text-xs text-muted">{meta.theme || "Thème non renseigné"}</p>
          </div>
          <SaveIndicator status={status} error={error} />
          <div className="flex w-full gap-2 sm:w-auto">
            <button className="btn" onClick={() => fileRef.current?.click()} title="Pré-remplir depuis un .docx existant">
              <IconUpload /> <span className="hidden md:inline">Importer</span>
            </button>
            <button className="btn btn-primary flex-1 justify-center sm:flex-none" onClick={() => setDownload("docx")}>
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
      </div>

      {notice && (
        <p className="mb-4 flex items-start gap-2 rounded-sm border border-line bg-surface px-3 py-2 text-sm">
          <span className="flex-1">{notice}</span>
          <button className="text-muted hover:text-ink" onClick={() => setNotice(null)} aria-label="Fermer">×</button>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Formulaire */}
        <div className={`space-y-4 ${mobileView === "preview" ? "hidden lg:block" : ""}`}>
          <section className="rounded-sm border border-line bg-surface">
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

          {tab === "retour" && template.sections.length === 1 && (
            <p className="rounded-sm border border-dashed border-line bg-surface px-4 py-3 text-xs text-muted">
              Les rubriques du prosit retour ne sont pas encore définies : un champ libre est utilisé en attendant.
            </p>
          )}

          {template.sections.map((s, si) => {
            const n = sectionNums[si];
            const isRoles = s.fields.every((f) => f.kind === "role");
            return (
              <section key={s.title} className="rounded-sm border border-line bg-surface px-4 py-4">
                <h2 className="title-cesi mb-3 text-base">
                  {n && <span className="mr-2 text-muted">{toRoman(n)}</span>}
                  <span className="underline-accent">{s.title}</span>
                </h2>
                <div className={isRoles ? "grid gap-3 sm:grid-cols-2" : "space-y-4"}>
                  {s.fields.map((f) => (
                    <FieldEditor key={`${tab}:${f.key}`} field={f} value={doc.content[f.key]} onChange={(v) => setField(f.key, v)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Aperçu */}
        <div className={`${mobileView === "form" ? "hidden lg:block" : ""}`}>
          <div className="lg:sticky lg:top-[9.5rem] lg:max-h-[calc(100dvh-10.5rem)] lg:overflow-auto">
            <p className="mb-2 text-xs text-muted">
              Aperçu · <code>{filename}.docx</code>
            </p>
            <Preview meta={meta} type={tab} content={doc.content} settings={settings} />
          </div>
        </div>
      </div>

      {download && (
        <DownloadDialog
          open
          format={download}
          defaultName={filename}
          documentId={doc.id}
          beforeDownload={flush}
          onClose={() => setDownload(null)}
        />
      )}
    </main>
  );
}

function FieldEditor({ field, value, onChange }: { field: FieldDef; value: Content[string]; onChange: (v: Content[string]) => void }) {
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
        <textarea
          id={id}
          className="field min-h-24 resize-y leading-relaxed"
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={field.key === "contenu" ? 16 : 4}
        />
      ) : (
        <ListEditor
          label={field.label}
          items={Array.isArray(value) ? (value as ListItem[]) : []}
          style={field.style}
          placeholder={field.placeholder}
          onChange={onChange}
        />
      )}
    </div>
  );
}
