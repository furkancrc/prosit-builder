"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AnneeRow, MatiereRow, PrositRow } from "@/lib/db";
import { formatDateFr } from "@/lib/meta";
import { api } from "@/lib/client-api";
import { currentMatiere, defaultAnneeId } from "@/lib/dossiers";
import type { Content } from "@/lib/schema";
import { retourToAller } from "@/lib/templates";
import { IconCopy, IconEdit, IconPlus, IconTrash, IconUpload } from "./icons";

const UNCLASSIFIED = "non-classes";
const STORE_KEY = "prosit-builder:annee";

export function PrositList({ initial, initialDossiers }: { initial: PrositRow[]; initialDossiers: AnneeRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [dossiers, setDossiers] = useState(initialDossiers);
  const [anneeId, setAnneeId] = useState<string>(() => defaultAnneeId(initialDossiers) ?? UNCLASSIFIED);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [addingMatiere, setAddingMatiere] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importTarget = useRef<string | null>(null);

  // Année affichée la dernière fois (par navigateur).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved && (saved === UNCLASSIFIED || initialDossiers.some((a) => a.id === saved))) setAnneeId(saved);
    } catch {}
  }, [initialDossiers]);
  const selectAnnee = (id: string) => {
    setAnneeId(id);
    setAddingMatiere(false);
    try {
      localStorage.setItem(STORE_KEY, id);
    } catch {}
  };

  const allMatieres = useMemo(() => dossiers.flatMap((a) => a.matieres), [dossiers]);
  const known = new Set(allMatieres.map((m) => m.id));
  const unclassified = items.filter((p) => !p.matiereId || !known.has(p.matiereId));
  const annee = dossiers.find((a) => a.id === anneeId);
  const enCours = currentMatiere(dossiers);

  // Plus rien à classer (ou année supprimée) : on revient sur l'année par défaut.
  useEffect(() => {
    if ((anneeId === UNCLASSIFIED && unclassified.length === 0) || (anneeId !== UNCLASSIFIED && !annee)) {
      const fallback = defaultAnneeId(dossiers);
      if (fallback) setAnneeId(fallback);
    }
  }, [anneeId, annee, unclassified.length, dossiers]);

  const reload = async () => {
    const [p, d] = await Promise.all([api<PrositRow[]>("/api/prosits"), api<AnneeRow[]>("/api/dossiers")]);
    setItems(p);
    setDossiers(d);
  };
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

  // ---------- prosits ----------

  const create = (matiereId: string | null) =>
    run(async () => {
      const { id } = await api<{ id: string }>("/api/prosits", { method: "POST", body: JSON.stringify({ matiereId }) });
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

  const move = (id: string, matiereId: string | null) =>
    run(async () => {
      await api(`/api/prosits/${id}/matiere`, { method: "PUT", body: JSON.stringify({ matiereId }) });
      await reload();
    });

  const askImport = (matiereId: string | null) => {
    importTarget.current = matiereId;
    fileRef.current?.click();
  };

  const importFile = (file: File) =>
    run(async () => {
      const fd = new FormData();
      fd.append("file", file);
      // indice tiré du nom du fichier ; le type lu dans le document reste prioritaire
      fd.append("type", /retour|cer/i.test(file.name) ? "retour" : "aller");
      const r = await api<{ type: "aller" | "retour" | null; meta: { numero?: string; theme?: string }; content: Content }>("/api/import", { method: "POST", body: fd });
      const type = r.type ?? (/retour|cer/i.test(file.name) ? "retour" : "aller");
      const nom = file.name.replace(/\.docx$/i, "").trim();
      // un retour importé seul reconstitue aussi l'aller (mêmes éléments, sans définitions ni statuts)
      const contents = type === "retour" ? { retour: r.content, aller: retourToAller(r.content) } : { aller: r.content };
      const { id } = await api<{ id: string }>("/api/prosits", {
        method: "POST",
        body: JSON.stringify({ nom, numero: r.meta.numero, theme: r.meta.theme, contents, matiereId: importTarget.current }),
      });
      router.push(`/prosits/${id}?tab=${type}`);
    });

  // ---------- années et matières ----------

  const addAnnee = () => {
    const nom = prompt("Nom de la nouvelle année (ex. FISA A4) :")?.trim();
    if (!nom) return;
    run(async () => {
      const { id } = await api<{ id: string }>("/api/annees", { method: "POST", body: JSON.stringify({ nom }) });
      await reload();
      selectAnnee(id);
    });
  };

  const renameAnnee = (a: AnneeRow) => {
    const nom = prompt("Nouveau nom de l’année :", a.nom)?.trim();
    if (!nom || nom === a.nom) return;
    run(async () => { await api(`/api/annees/${a.id}`, { method: "PATCH", body: JSON.stringify({ nom }) }); await reload(); });
  };

  const deleteAnnee = (a: AnneeRow) => {
    const n = items.filter((p) => a.matieres.some((m) => m.id === p.matiereId)).length;
    if (!confirm(`Supprimer l’année « ${a.nom} » et ses ${a.matieres.length} matière(s) ?${n ? `\nSes ${n} prosit(s) ne sont pas supprimés : ils passent dans « Non classés ».` : ""}`)) return;
    run(async () => {
      await api(`/api/annees/${a.id}`, { method: "DELETE" });
      await reload();
      selectAnnee(dossiers.find((x) => x.id !== a.id)?.id ?? UNCLASSIFIED);
    });
  };

  const saveMatiere = (data: { nom: string; debut: string; fin: string }, existing?: MatiereRow) =>
    run(async () => {
      if (existing) await api(`/api/matieres/${existing.id}`, { method: "PATCH", body: JSON.stringify(data) });
      else await api("/api/matieres", { method: "POST", body: JSON.stringify({ ...data, anneeId }) });
      setEditing(null);
      setAddingMatiere(false);
      await reload();
    });

  const deleteMatiere = (m: MatiereRow) => {
    const n = items.filter((p) => p.matiereId === m.id).length;
    if (!confirm(`Supprimer la matière « ${m.nom} » ?${n ? `\nSes ${n} prosit(s) ne sont pas supprimés : ils passent dans « Non classés ».` : ""}`)) return;
    run(async () => { await api(`/api/matieres/${m.id}`, { method: "DELETE" }); await reload(); });
  };

  // ---------- rendu ----------

  const prositRow = (p: PrositRow) => (
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
        <select
          className="field w-auto max-w-40 py-1 text-xs"
          value={p.matiereId && known.has(p.matiereId) ? p.matiereId : ""}
          onChange={(e) => move(p.id, e.target.value || null)}
          disabled={busy}
          title="Ranger dans une matière"
          aria-label={`Ranger « ${p.nom} » dans une matière`}
        >
          <option value="">Non classé</option>
          {dossiers.map((a) => (
            <optgroup key={a.id} label={a.nom}>
              {a.matieres.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nom}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button className="btn btn-ghost btn-icon" title="Renommer" aria-label="Renommer" onClick={() => setRenaming(p.id)}><IconEdit /></button>
        <button className="btn btn-ghost btn-icon" title="Dupliquer" aria-label="Dupliquer" onClick={() => duplicate(p.id)} disabled={busy}><IconCopy /></button>
        <button className="btn btn-ghost btn-icon text-danger" title="Supprimer" aria-label="Supprimer" onClick={() => remove(p)} disabled={busy}><IconTrash /></button>
      </div>
    </li>
  );

  const list = (ps: PrositRow[], emptyText: string) =>
    ps.length ? (
      <ul className="divide-y divide-line border-t border-line">{ps.map(prositRow)}</ul>
    ) : (
      <p className="border-t border-line px-4 py-3 text-sm text-muted">{emptyText}</p>
    );

  const tabClass = (on: boolean) =>
    `title-cesi -mb-px whitespace-nowrap border-b-[3px] px-4 py-1.5 text-sm ${on ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <h1 className="title-cesi text-2xl sm:text-3xl">
          <span className="underline-accent">Mes prosits</span>
        </h1>
        {enCours && (
          <button className="btn btn-primary ml-auto" onClick={() => create(enCours.id)} disabled={busy} title={`Créer dans « ${enCours.nom} »`}>
            <IconPlus /> Nouveau prosit <span className="hidden sm:inline">· {enCours.nom}</span>
          </button>
        )}
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

      {error && <p className="mb-4 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {/* Années */}
      <div className="mb-5 flex items-end gap-1 overflow-x-auto overflow-y-hidden border-b border-line" role="tablist" aria-label="Années">
        {dossiers.map((a) => (
          <button key={a.id} role="tab" aria-selected={a.id === anneeId} className={tabClass(a.id === anneeId)} onClick={() => selectAnnee(a.id)}>
            {a.nom}
          </button>
        ))}
        {(unclassified.length > 0 || dossiers.length === 0) && (
          <button role="tab" aria-selected={anneeId === UNCLASSIFIED} className={tabClass(anneeId === UNCLASSIFIED)} onClick={() => selectAnnee(UNCLASSIFIED)}>
            Non classés <span className="font-sans text-xs">({unclassified.length})</span>
          </button>
        )}
        <button className="btn btn-ghost mb-1 ml-1 shrink-0 text-xs" onClick={addAnnee} disabled={busy} title="Ajouter une année">
          <IconPlus width={14} height={14} /> Année
        </button>
      </div>

      {anneeId === UNCLASSIFIED || !annee ? (
        <section className="overflow-hidden rounded-sm border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <h2 className="title-cesi text-base">Non classés</h2>
            <span className="text-xs text-muted">Range-les dans une matière avec le menu de chaque prosit.</span>
            <div className="ml-auto flex gap-1">
              <button className="btn btn-ghost text-xs" onClick={() => askImport(null)} disabled={busy}>
                <IconUpload width={14} height={14} /> Importer
              </button>
              <button className="btn text-xs" onClick={() => create(null)} disabled={busy}>
                <IconPlus width={14} height={14} /> Nouveau prosit
              </button>
            </div>
          </div>
          {list(unclassified, "Aucun prosit non classé.")}
        </section>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>
              {annee.matieres.length} matière(s) · {items.filter((p) => annee.matieres.some((m) => m.id === p.matiereId)).length} prosit(s)
            </span>
            <button className="btn btn-ghost ml-auto text-xs" onClick={() => renameAnnee(annee)} disabled={busy}>
              <IconEdit width={14} height={14} /> Renommer l’année
            </button>
            <button className="btn btn-ghost text-xs text-danger" onClick={() => deleteAnnee(annee)} disabled={busy}>
              <IconTrash width={14} height={14} /> Supprimer
            </button>
          </div>

          {annee.matieres.map((m) => {
            const ps = items.filter((p) => p.matiereId === m.id);
            const current = enCours?.id === m.id;
            return (
              <section key={m.id} className={`overflow-hidden rounded-sm border bg-surface ${current ? "border-ink/40" : "border-line"}`}>
                {editing === m.id ? (
                  <MatiereForm initial={m} onCancel={() => setEditing(null)} onSave={(d) => saveMatiere(d, m)} busy={busy} />
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="title-cesi flex items-center gap-2 text-base">
                        <span className="underline-accent truncate">{m.nom}</span>
                        {current && <span className="rounded-sm bg-accent px-1.5 py-0.5 font-sans text-[10px] font-semibold normal-case text-accent-fg">En cours</span>}
                      </h2>
                      <p className="text-xs text-muted">
                        {[m.debut && m.fin ? `${formatDateFr(m.debut)} → ${formatDateFr(m.fin)}` : m.debut && `dès le ${formatDateFr(m.debut)}`, `${ps.length} prosit(s)`].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="btn btn-ghost btn-icon" title="Modifier la matière" aria-label={`Modifier ${m.nom}`} onClick={() => setEditing(m.id)}><IconEdit /></button>
                      <button className="btn btn-ghost btn-icon text-danger" title="Supprimer la matière" aria-label={`Supprimer ${m.nom}`} onClick={() => deleteMatiere(m)} disabled={busy}><IconTrash /></button>
                      <button className="btn btn-ghost text-xs" onClick={() => askImport(m.id)} disabled={busy} title="Importer un .docx dans cette matière">
                        <IconUpload width={14} height={14} /> Importer
                      </button>
                      <button className="btn text-xs" onClick={() => create(m.id)} disabled={busy}>
                        <IconPlus width={14} height={14} /> Nouveau prosit
                      </button>
                    </div>
                  </div>
                )}
                {list(ps, "Aucun prosit dans cette matière.")}
              </section>
            );
          })}

          {addingMatiere ? (
            <section className="rounded-sm border border-line bg-surface">
              <MatiereForm onCancel={() => setAddingMatiere(false)} onSave={(d) => saveMatiere(d)} busy={busy} />
            </section>
          ) : (
            <button className="btn w-full justify-center border-dashed text-sm" onClick={() => setAddingMatiere(true)}>
              <IconPlus /> Ajouter une matière à {annee.nom}
            </button>
          )}
        </div>
      )}
    </main>
  );
}

function MatiereForm({
  initial,
  onSave,
  onCancel,
  busy,
}: {
  initial?: MatiereRow;
  onSave: (d: { nom: string; debut: string; fin: string }) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <form
      className="flex flex-wrap items-end gap-2 px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const nom = String(f.get("nom") ?? "").trim();
        if (nom) onSave({ nom, debut: String(f.get("debut") ?? ""), fin: String(f.get("fin") ?? "") });
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <label className="min-w-48 flex-1 text-xs text-muted">
        Matière
        <input name="nom" className="field mt-1" defaultValue={initial?.nom} placeholder="Génie logiciel" autoFocus required />
      </label>
      <label className="text-xs text-muted">
        Début
        <input name="debut" type="date" className="field mt-1" defaultValue={initial?.debut} />
      </label>
      <label className="text-xs text-muted">
        Fin
        <input name="fin" type="date" className="field mt-1" defaultValue={initial?.fin} />
      </label>
      <button className="btn btn-primary" disabled={busy}>{initial ? "Enregistrer" : "Ajouter"}</button>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
    </form>
  );
}
