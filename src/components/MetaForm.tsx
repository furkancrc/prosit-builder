"use client";

import type { DocType, Meta, MetaPatch } from "@/lib/schema";
import { IconReset } from "./icons";

const FIELDS: { key: keyof Meta; label: string; type?: string; placeholder: string; span?: string }[] = [
  { key: "nom", label: "Nom du prosit", placeholder: "Prosit aller SI - 1", span: "sm:col-span-2" },
  { key: "theme", label: "Thème / matière", placeholder: "SI : Administration et Sécurité", span: "sm:col-span-2" },
  { key: "numero", label: "Numéro", placeholder: "1" },
  { key: "date", label: "Date", type: "date", placeholder: "" },
  { key: "bloc", label: "Bloc / projet", placeholder: "SI et Sécurité 2026-27", span: "sm:col-span-2" },
  { key: "auteur", label: "Auteur (nom, prénom)", placeholder: "Nom Prénom", span: "sm:col-span-2" },
  { key: "groupe", label: "Groupe / classe", placeholder: "FISA A3", span: "sm:col-span-2" },
];

interface Props {
  type: DocType;
  /** Valeurs effectives affichées. */
  meta: Meta;
  /** Surcharges du prosit retour (null pour l'aller). */
  overrides: MetaPatch | null;
  onChange: (key: keyof Meta, value: string) => void;
  onReset: (key: keyof Meta) => void;
}

export function MetaForm({ type, meta, overrides, onChange, onReset }: Props) {
  return (
    <div>
      {type === "retour" && (
        <p className="mb-3 text-xs text-muted">
          Reprises du prosit aller. Une valeur modifiée ici ne concerne que le retour (<span className="font-semibold text-ink">●</span>) ; ↺ pour revenir à la valeur de l’aller.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FIELDS.map((f) => {
          const overridden = !!overrides && typeof overrides[f.key] === "string";
          return (
            <label key={f.key} className={`block min-w-0 ${f.span ? "col-span-2" : "col-span-1"}`}>
              <span className="mb-1 flex items-center gap-1 text-xs font-medium text-muted">
                {f.label}
                {overridden && (
                  <>
                    <span className="text-ink" title="Valeur propre au retour">●</span>
                    <button type="button" className="ml-auto text-muted hover:text-ink" title="Reprendre la valeur de l’aller" aria-label={`Réinitialiser ${f.label}`} onClick={() => onReset(f.key)}>
                      <IconReset width={13} height={13} />
                    </button>
                  </>
                )}
              </span>
              <input
                className="field"
                type={f.type ?? "text"}
                value={meta[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
