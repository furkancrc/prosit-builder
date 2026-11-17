"use client";

import { useEffect, useRef, useState } from "react";
import { withExtension } from "@/lib/filename";
import { IconDownload } from "./icons";

interface Props {
  open: boolean;
  format: "docx" | "pdf";
  defaultName: string;
  documentId: string;
  beforeDownload: () => Promise<void>;
  onClose: () => void;
}

export function DownloadDialog({ open, format, defaultName, documentId, beforeDownload, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setName(defaultName);
      setError(null);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open, defaultName]);

  async function download(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await beforeDownload();
      const filename = withExtension(name || defaultName, format);
      const res = await fetch(`/api/documents/${documentId}/export?format=${format}&filename=${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Erreur ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label = format === "docx" ? "Word (.docx)" : "PDF";
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(92vw,30rem)] rounded-sm border border-line bg-surface p-0 text-ink backdrop:bg-black/50"
    >
      <form onSubmit={download} className="p-5">
        <h2 className="title-cesi mb-4 text-lg">
          <span className="underline-accent">Télécharger en {label}</span>
        </h2>
        <label className="mb-1 block text-xs font-medium text-muted" htmlFor="dl-name">
          Nom du fichier
        </label>
        <div className="flex items-stretch">
          <input id="dl-name" className="field rounded-r-none" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <span className="flex items-center rounded-r-sm border border-l-0 border-line bg-surface-2 px-2 text-sm text-muted">.{format}</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Fichier final : <code className="break-all">{withExtension(name || defaultName, format)}</code>
        </p>
        {error && <p className="mt-3 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={busy}>
            <IconDownload /> {busy ? (format === "pdf" ? "Conversion…" : "Génération…") : "Télécharger"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
