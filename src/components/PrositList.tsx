"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { PrositRow } from "@/lib/db";
import { formatDateFr } from "@/lib/meta";
import { api } from "@/lib/client-api";
import { IconCopy, IconEdit, IconPlus, IconTrash, IconUpload } from "./icons";

export function PrositList({ initial }: { initial: PrositRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => setItems(await api<PrositRow[]>("/api/prosits"));
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const { id } = await api<{ id: string }>("/api/prosits", { method: "POST", body: JSON.stringify({}) });
      router.push(`/prosits/${id}`);
    });

  const duplicate = (id: string) => run(async () => { await api(`/api/prosits/${id}/duplicate`, { method: "POST" }); await reload(); });

  const remove = (p: PrositRow) => {
    if (!confirm(`Supprimer « ${p.nom} » (aller et retour) ? Cette action est définitive.`)) return;
    run(async () => { await api(`/api/prosits/${p.id}`, { method: "DELETE" }); await reload(); });
  };

  const rename = (id: string, nom: string) =>
    run(async () => {
      setRenaming(null);
      await api(`/api/prosits/${id}`, { method: "PATCH", body: JSON.stringify({ nom }) });
      await reload();
    });

  const importFile = (file: File) =>
    run(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api<{ type: "aller" | "retour" | null; meta: { numero?: string }; content: Record<string, unknown> }>("/api/import", { method: "POST", body: fd });
      const type = r.type ?? "aller";
      const nom = file.name.replace(/\.docx$/i, "").trim();
      const { id } = await api<{ id: string }>("/api/prosits", {
        method: "POST",
        body: JSON.stringify({ nom, numero: r.meta.numero, contents: { [type]: r.content } }),
      });
      router.push(`/prosits/${id}?tab=${type}`);
    });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <h1 className="title-cesi text-2xl sm:text-3xl">
          <span className="underline-accent">Mes prosits</span>
        </h1>
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
            <IconUpload /> Importer un .docx
          </button>
          <button className="btn btn-primary" onClick={create} disabled={busy}>
            <IconPlus /> Nouveau prosit
          </button>
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
      </div>

      {error && <p className="mb-4 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {items.length === 0 ? (
        <div className="rounded-sm border border-dashed border-line bg-surface px-6 py-14 text-center">
          <p className="title-cesi mb-2 text-lg">Aucun prosit</p>
          <p className="mb-5 text-sm text-muted">Crée ton premier prosit ou importe un .docx existant.</p>
          <button className="btn btn-primary" onClick={create} disabled={busy}>
            <IconPlus /> Nouveau prosit
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-sm border border-line bg-surface">
          {items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                {renaming === p.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = new FormData(e.currentTarget).get("nom");
                      if (typeof v === "string" && v.trim()) rename(p.id, v.trim());
                    }}
                    className="flex gap-2"
                  >
                    <input name="nom" defaultValue={p.nom} autoFocus className="field" onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} />
                    <button className="btn btn-primary">OK</button>
                  </form>
                ) : (
                  <Link href={`/prosits/${p.id}`} className="block">
                    <span className="block truncate font-semibold">{p.nom || "Sans nom"}</span>
                    <span className="block truncate text-xs text-muted">
                      {[p.theme, p.numero && `n° ${p.numero}`, p.date && formatDateFr(p.date)].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Link href={`/prosits/${p.id}?tab=aller`} className="btn btn-ghost text-xs">Aller</Link>
                <Link href={`/prosits/${p.id}?tab=retour`} className="btn btn-ghost text-xs">Retour</Link>
                <button className="btn btn-ghost btn-icon" title="Renommer" aria-label="Renommer" onClick={() => setRenaming(p.id)}><IconEdit /></button>
                <button className="btn btn-ghost btn-icon" title="Dupliquer" aria-label="Dupliquer" onClick={() => duplicate(p.id)} disabled={busy}><IconCopy /></button>
                <button className="btn btn-ghost btn-icon text-danger" title="Supprimer" aria-label="Supprimer" onClick={() => remove(p)} disabled={busy}><IconTrash /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
