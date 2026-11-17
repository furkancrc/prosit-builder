"use client";

import { useEffect, useRef } from "react";

export const SECTION_KEYS = ["A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P"];

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink">{children}</kbd>
);
const Keys = ({ keys }: { keys: string[] }) => (
  <span className="flex flex-wrap justify-end gap-1">
    {keys.map((k, i) => (
      <Kbd key={i}>{k}</Kbd>
    ))}
  </span>
);

export function HelpDialog({ open, onClose, sections }: { open: boolean; onClose: () => void; sections: string[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const general: [string, string[]][] = [
    ["Rubrique suivante", ["Ctrl", "Entrée"]],
    ["Rubrique précédente", ["Ctrl", "Maj", "Entrée"]],
    ["Télécharger en Word", ["Ctrl", "S"]],
    ["Annuler", ["Ctrl", "Z"]],
    ["Rétablir", ["Ctrl", "Maj", "Z"]],
    ["Changer de thème", ["Ctrl", "Alt", "L"]],
    ["Afficher / masquer l’aide", ["F1"]],
  ];
  const lists: [string, string[]][] = [
    ["Nouvel élément", ["Entrée"]],
    ["Sous-élément / remonter", ["Tab", "Maj+Tab"]],
    ["Déplacer l’élément", ["Alt", "↑ / ↓"]],
    ["Supprimer un élément vide", ["Retour arrière"]],
  ];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto max-h-[90dvh] w-[min(94vw,40rem)] overflow-auto rounded-sm border border-line bg-surface p-0 text-ink backdrop:bg-black/50"
    >
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-center">
          <h2 className="title-cesi text-lg">
            <span className="underline-accent">Aide</span>
          </h2>
          <button className="ml-auto text-xl text-muted hover:text-ink" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <h3 className="mb-1 text-sm font-semibold">Mode présentation</h3>
        <p className="mb-5 text-sm text-muted">
          Le bouton <strong className="text-ink">Présentation</strong> ouvre le prosit dans une fenêtre à part, lisible de loin, à mettre sur le
          vidéoprojecteur. Elle se met à jour pendant que tu écris et surligne la rubrique en cours. Garde l’éditeur sur ton écran.
        </p>

        <h3 className="mb-2 text-sm font-semibold">Raccourcis</h3>
        <dl className="mb-5 divide-y divide-line text-sm">
          {general.map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-1.5">
              <dt>{label}</dt>
              <dd><Keys keys={keys} /></dd>
            </div>
          ))}
        </dl>

        <h3 className="mb-2 text-sm font-semibold">Aller à une rubrique</h3>
        <dl className="mb-5 grid gap-x-6 text-sm sm:grid-cols-2">
          {sections.map((s, i) => (
            <div key={s} className="flex items-center justify-between gap-3 border-b border-line py-1.5">
              <dt className="truncate">{s}</dt>
              <dd><Keys keys={["Alt", "Maj", SECTION_KEYS[i] ?? "?"]} /></dd>
            </div>
          ))}
        </dl>

        <h3 className="mb-2 text-sm font-semibold">Dans une liste</h3>
        <dl className="divide-y divide-line text-sm">
          {lists.map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-1.5">
              <dt>{label}</dt>
              <dd><Keys keys={keys} /></dd>
            </div>
          ))}
        </dl>
      </div>
    </dialog>
  );
}
