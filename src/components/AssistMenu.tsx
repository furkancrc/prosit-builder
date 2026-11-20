"use client";

import { useEffect, useRef, useState } from "react";
import { IconSparkle } from "./icons";

export interface AssistMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/** Petit bouton ✦ qui ouvre les actions de l'assistant pour un élément ou un champ. */
export function AssistMenu({ items, title = "Assistant", className = "" }: { items: AssistMenuItem[]; title?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex rounded-sm p-1.5 hover:text-ink ${open ? "text-ink" : "text-muted"}`}
      >
        <IconSparkle />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-52 rounded-sm border border-line bg-surface py-1 text-sm shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className="block w-full px-3 py-1.5 text-left whitespace-nowrap hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
