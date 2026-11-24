"use client";

import { useEffect, useRef, useState } from "react";
import type { Content, DocType, Meta, Settings } from "@/lib/schema";
import { Preview } from "./Preview";

type Mode = "apercu" | "pdf";

/**
 * Aperçu en plein écran : l'aperçu en direct (agrandi), ou le vrai PDF tel qu'il sera téléchargé.
 * Échap ferme ; le mode plein écran du navigateur est demandé quand il est disponible.
 */
export function FullscreenPreview({
  meta,
  type,
  content,
  settings,
  documentId,
  filename,
  beforePdf,
  onClose,
}: {
  meta: Meta;
  type: DocType;
  content: Content;
  settings: Settings;
  documentId: string;
  filename: string;
  /** Enregistre les modifications en attente avant de générer le PDF. */
  beforePdf: () => Promise<void>;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const fullscreenWas = useRef(false);
  const [mode, setMode] = useState<Mode>("apercu");
  const [zoom, setZoom] = useState(1.25);
  const [pdf, setPdf] = useState<{ url?: string; error?: string; loading?: boolean }>({});

  // vrai plein écran (sinon la fenêtre recouvre simplement la page)
  useEffect(() => {
    const el = box.current;
    el?.requestFullscreen?.().catch(() => {});
    const onChange = () => {
      if (!document.fullscreenElement && fullscreenWas.current) onClose();
      fullscreenWas.current = !!document.fullscreenElement;
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // PDF généré à la demande, à partir du document enregistré
  const loadPdf = async () => {
    setPdf((p) => ({ ...p, loading: true, error: undefined }));
    try {
      await beforePdf();
      const res = await fetch(`/api/documents/${documentId}/export?format=pdf`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Erreur ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      setPdf((p) => {
        if (p.url) URL.revokeObjectURL(p.url);
        return { url };
      });
    } catch (e) {
      setPdf((p) => ({ url: p.url, error: (e as Error).message }));
    }
  };
  useEffect(() => {
    if (mode === "pdf" && !pdf.url && !pdf.loading && !pdf.error) loadPdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  useEffect(() => () => void (pdf.url && URL.revokeObjectURL(pdf.url)), [pdf.url]);

  return (
    <div ref={box} role="dialog" aria-modal="true" aria-label="Aperçu en plein écran" className="fixed inset-0 z-50 flex flex-col bg-[#3a3a3a]">
      <div className="flex flex-wrap items-center gap-2 border-b border-black/40 bg-surface px-3 py-2 text-sm">
        <div className="flex rounded-sm border border-line p-0.5" role="tablist">
          {(["apercu", "pdf"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={`rounded-sm px-3 py-1 text-xs font-semibold ${mode === m ? "bg-ink text-surface" : "text-muted hover:text-ink"}`}
              onClick={() => setMode(m)}
            >
              {m === "apercu" ? "Aperçu en direct" : "PDF final"}
            </button>
          ))}
        </div>
        {mode === "apercu" ? (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-icon" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))} aria-label="Dézoomer" title="Dézoomer">
              −
            </button>
            <button className="min-w-12 text-xs tabular-nums text-muted" onClick={() => setZoom(1.25)} title="Zoom par défaut">
              {Math.round(zoom * 100)} %
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} aria-label="Zoomer" title="Zoomer">
              +
            </button>
          </div>
        ) : (
          <button className="btn btn-ghost px-2 py-1 text-xs" onClick={loadPdf} disabled={pdf.loading}>
            {pdf.loading ? "Génération…" : "Régénérer"}
          </button>
        )}
        <code className="hidden min-w-0 flex-1 truncate text-xs text-muted sm:block">
          {filename}.{mode === "pdf" ? "pdf" : "docx"}
        </code>
        <button className="btn ml-auto px-3 py-1 text-xs" onClick={onClose} title="Fermer (Échap)">
          Fermer ✕
        </button>
      </div>

      {mode === "apercu" ? (
        <div className="flex-1 overflow-auto py-6">
          {/* zoom : la feuille garde sa mise en page, seule l'échelle change */}
          <div className="mx-auto shadow-2xl" style={{ width: `calc(210mm * ${zoom})`, maxWidth: "none" }}>
            <div style={{ zoom }}>
              <Preview meta={meta} type={type} content={content} settings={settings} />
            </div>
          </div>
        </div>
      ) : pdf.url ? (
        <iframe src={pdf.url} title="PDF final" className="w-full flex-1 border-0 bg-white" />
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-white/80">
          {pdf.error ? (
            <p>
              PDF indisponible : {pdf.error}
              <br />
              <button className="mt-3 underline" onClick={() => setMode("apercu")}>
                Revenir à l’aperçu
              </button>
            </p>
          ) : (
            <p className="animate-pulse">Génération du PDF avec LibreOffice…</p>
          )}
        </div>
      )}
    </div>
  );
}
