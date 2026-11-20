"use client";

import { useEffect, useRef, useState } from "react";
import type { RichBlock } from "@/lib/schema";
import { newItemId } from "@/lib/list-ops";
import { IconDown, IconPlus, IconTrash, IconUp } from "./icons";

/** Envoie une image au serveur et renvoie son identifiant. */
export async function uploadImage(file: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", file, (file as File).name || "image.png");
  const res = await fetch("/api/assets", { method: "POST", body: fd });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Envoi impossible (${res.status})`);
  return (await res.json()).id as string;
}

/** Images présentes dans un presse-papiers (capture d'écran, copie depuis Packet Tracer…). */
export function clipboardImages(e: React.ClipboardEvent): File[] {
  return [...e.clipboardData.items].filter((i) => i.kind === "file" && i.type.startsWith("image/")).map((i) => i.getAsFile()).filter((f): f is File => !!f);
}

export async function imagesBlockFromFiles(files: File[]): Promise<RichBlock> {
  const ids = await Promise.all(files.map(uploadImage));
  return { id: newItemId(), type: "images", columns: Math.min(ids.length, 2), images: ids.map((assetId) => ({ assetId, caption: "" })) };
}

interface Props {
  blocks: RichBlock[];
  onChange: (blocks: RichBlock[]) => void;
}

/** Contenu riche sous un élément du prosit retour : paragraphes, images (grille légendée), tableaux. */
export function RichBlocks({ blocks, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (i: number, b: RichBlock) => onChange(blocks.map((x, k) => (k === i ? b : x)));
  const remove = (i: number) => onChange(blocks.filter((_, k) => k !== i));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const addImages = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      onChange([...blocks, await imagesBlockFromFiles(files)]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {blocks.map((b, i) => (
        <div key={b.id} className="group/block relative rounded-sm border border-line bg-surface p-2">
          <div className="absolute -top-2.5 right-1 flex gap-0.5 rounded-sm border border-line bg-surface px-0.5 opacity-100 sm:opacity-0 sm:group-hover/block:opacity-100 sm:group-focus-within/block:opacity-100">
            <SmallBtn label="Monter" onClick={() => move(i, -1)} disabled={i === 0}><IconUp width={12} height={12} /></SmallBtn>
            <SmallBtn label="Descendre" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}><IconDown width={12} height={12} /></SmallBtn>
            <SmallBtn label="Supprimer le bloc" onClick={() => remove(i)} className="hover:text-danger"><IconTrash width={12} height={12} /></SmallBtn>
          </div>
          {b.type === "text" && <TextBlock value={b.text} onChange={(text) => set(i, { ...b, text })} />}
          {b.type === "images" && <ImagesBlock block={b} onChange={(nb) => set(i, nb)} />}
          {b.type === "table" && <TableBlock block={b} onChange={(nb) => set(i, nb)} />}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-1 text-xs">
        <button type="button" className="btn btn-ghost px-2 py-1 text-xs text-muted hover:text-ink" onClick={() => onChange([...blocks, { id: newItemId(), type: "text", text: "" }])}>
          <IconPlus width={12} height={12} /> Paragraphe
        </button>
        <button type="button" className="btn btn-ghost px-2 py-1 text-xs text-muted hover:text-ink" onClick={() => fileRef.current?.click()} disabled={busy}>
          <IconPlus width={12} height={12} /> {busy ? "Envoi…" : "Image / schéma"}
        </button>
        <button
          type="button"
          className="btn btn-ghost px-2 py-1 text-xs text-muted hover:text-ink"
          onClick={() => onChange([...blocks, { id: newItemId(), type: "table", header: true, rows: [["", ""], ["", ""]] }])}
        >
          <IconPlus width={12} height={12} /> Tableau
        </button>
        <span className="text-muted/70">ou Ctrl+V pour coller une capture</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void addImages(files);
          }}
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function SmallBtn({ label, onClick, disabled, className = "", children }: { label: string; onClick: () => void; disabled?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className={`p-1 text-muted hover:text-ink disabled:opacity-25 ${className}`}>
      {children}
    </button>
  );
}

function TextBlock({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={2}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Paragraphe… (**gras** possible)"
      className="field resize-none overflow-hidden border-0 bg-transparent p-1 text-[0.85rem] leading-relaxed focus:shadow-none"
      aria-label="Paragraphe"
    />
  );
}

function ImagesBlock({ block, onChange }: { block: Extract<RichBlock, { type: "images" }>; onChange: (b: Extract<RichBlock, { type: "images" }>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const setImg = (i: number, caption: string) => onChange({ ...block, images: block.images.map((im, k) => (k === i ? { ...im, caption } : im)) });
  const removeImg = (i: number) => onChange({ ...block, images: block.images.filter((_, k) => k !== i) });
  const add = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const ids = await Promise.all(files.map(uploadImage));
      onChange({ ...block, images: [...block.images, ...ids.map((assetId) => ({ assetId, caption: "" }))] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        <span>Colonnes :</span>
        {[1, 2, 3].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange({ ...block, columns: c })}
            className={`rounded-sm border px-2 py-0.5 ${block.columns === c ? "border-ink bg-ink text-bg" : "border-line"}`}
          >
            {c}
          </button>
        ))}
        <button type="button" className="ml-auto hover:text-ink" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "Envoi…" : "+ image"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void add(files);
          }}
        />
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${block.columns}, minmax(0, 1fr))` }}>
        {block.images.map((im, i) => (
          <figure key={`${im.assetId}-${i}`} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/assets/${im.assetId}`} alt={im.caption || "Image"} className="max-h-60 w-full rounded-sm border border-line bg-white object-contain" />
            <button
              type="button"
              onClick={() => removeImg(i)}
              className="absolute right-1 top-1 rounded-sm bg-black/60 p-1 text-white hover:bg-danger"
              aria-label="Retirer l’image"
              title="Retirer l’image"
            >
              <IconTrash width={12} height={12} />
            </button>
            <input className="field mt-1 py-1 text-center text-xs italic" value={im.caption} placeholder="Légende" onChange={(e) => setImg(i, e.target.value)} />
          </figure>
        ))}
      </div>
    </div>
  );
}

function TableBlock({ block, onChange }: { block: Extract<RichBlock, { type: "table" }>; onChange: (b: Extract<RichBlock, { type: "table" }>) => void }) {
  const cols = Math.max(1, ...block.rows.map((r) => r.length));
  const rows = block.rows.map((r) => Array.from({ length: cols }, (_, c) => r[c] ?? ""));
  const setCell = (ri: number, ci: number, v: string) => onChange({ ...block, rows: rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? v : c)) : r)) });
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} className="border border-line p-0">
                    <textarea
                      rows={1}
                      value={c}
                      onChange={(e) => setCell(ri, ci, e.target.value)}
                      className={`block min-h-8 w-full min-w-24 resize-y bg-transparent px-1.5 py-1 outline-none focus:bg-accent/10 ${block.header && ri === 0 ? "font-semibold" : ""}`}
                      aria-label={`Ligne ${ri + 1}, colonne ${ci + 1}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <button type="button" className="hover:text-ink" onClick={() => onChange({ ...block, rows: [...rows, Array(cols).fill("")] })}>+ ligne</button>
        <button type="button" className="hover:text-ink disabled:opacity-30" disabled={rows.length <= 1} onClick={() => onChange({ ...block, rows: rows.slice(0, -1) })}>− ligne</button>
        <button type="button" className="hover:text-ink disabled:opacity-30" disabled={cols >= 8} onClick={() => onChange({ ...block, rows: rows.map((r) => [...r, ""]) })}>+ colonne</button>
        <button type="button" className="hover:text-ink disabled:opacity-30" disabled={cols <= 1} onClick={() => onChange({ ...block, rows: rows.map((r) => r.slice(0, -1)) })}>− colonne</button>
        <label className="ml-auto flex items-center gap-1">
          <input type="checkbox" checked={block.header} onChange={(e) => onChange({ ...block, header: e.target.checked })} /> 1re ligne = en-tête
        </label>
      </div>
    </div>
  );
}
