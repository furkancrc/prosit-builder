"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import { listMarker, numberItems } from "@/lib/doc-model";
import { moveItem, moveSibling, newItemId, shiftLevel } from "@/lib/list-ops";
import { MAX_LEVEL, normalizeList, type ListItem } from "@/lib/schema";
import type { ListStyle } from "@/lib/templates";
import { IconDown, IconGrip, IconIndent, IconOutdent, IconPlus, IconTrash, IconUp } from "./icons";

interface Props {
  items: ListItem[];
  style: ListStyle;
  onChange: (items: ListItem[]) => void;
  placeholder?: string;
  label: string;
}

export function ListEditor({ items, style, onChange, placeholder, label }: Props) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  const numbers = numberItems(items);

  useEffect(() => {
    if (!focusId) return;
    const el = inputs.current.get(focusId);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    setFocusId(null);
  }, [focusId, items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const idx = (id: string) => items.findIndex((i) => i.id === id);

  const update = (id: string, text: string) => onChange(items.map((i) => (i.id === id ? { ...i, text } : i)));

  const insertAfter = (i: number, level?: number) => {
    const it: ListItem = { id: newItemId(), text: "", level: level ?? (i >= 0 ? items[i].level : 0) };
    const next = [...items.slice(0, i + 1), it, ...items.slice(i + 1)];
    onChange(next);
    setFocusId(it.id);
  };

  const remove = (i: number) => {
    const prev = items[i - 1]?.id ?? items[i + 1]?.id ?? null;
    // les sous-éléments orphelins sont ramenés à un niveau valide
    onChange(normalizeList(items.filter((_, k) => k !== i)));
    setFocusId(prev);
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    onChange(moveItem(items, idx(String(e.active.id)), idx(String(e.over.id))));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, i: number) => {
    const it = items[i];
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (it.text === "" && it.level > 0) onChange(shiftLevel(items, i, -1));
      else insertAfter(i);
    } else if (e.key === "Tab") {
      e.preventDefault();
      onChange(shiftLevel(items, i, e.shiftKey ? -1 : 1));
      setFocusId(it.id);
    } else if (e.key === "Backspace" && it.text === "") {
      e.preventDefault();
      remove(i);
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      onChange(moveSibling(items, i, e.key === "ArrowUp" ? -1 : 1));
      setFocusId(it.id);
    }
  };

  return (
    <div>
      <DndContext id={`dnd-${label}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-1" aria-label={label}>
            {items.map((it, i) => (
              <Row
                key={it.id}
                item={it}
                marker={listMarker(style, it.level, numbers[i])}
                placeholder={placeholder}
                inputRef={(el) => (el ? inputs.current.set(it.id, el) : inputs.current.delete(it.id))}
                onText={(t) => update(it.id, t)}
                onKeyDown={(e) => onKeyDown(e, i)}
                canIndent={i > 0 && it.level < MAX_LEVEL && it.level <= items[i - 1].level}
                canOutdent={it.level > 0}
                onIndent={() => onChange(shiftLevel(items, i, 1))}
                onOutdent={() => onChange(shiftLevel(items, i, -1))}
                onUp={() => onChange(moveSibling(items, i, -1))}
                onDown={() => onChange(moveSibling(items, i, 1))}
                onDelete={() => remove(i)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <button type="button" className="btn btn-ghost mt-1 text-xs text-muted hover:text-ink" onClick={() => insertAfter(items.length - 1, 0)}>
        <IconPlus width={14} height={14} /> Ajouter
      </button>
    </div>
  );
}

interface RowProps {
  item: ListItem;
  marker: string;
  placeholder?: string;
  inputRef: (el: HTMLTextAreaElement | null) => void;
  onText: (t: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  canIndent: boolean;
  canOutdent: boolean;
  onIndent: () => void;
  onOutdent: () => void;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
}

function Row(p: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: p.item.id });
  const ta = useRef<HTMLTextAreaElement | null>(null);

  // hauteur automatique
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement ?? el);
    return () => ro.disconnect();
  }, [p.item.text]);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, marginLeft: `${p.item.level * 1.5}rem` }}
      className={`group flex items-start gap-1 rounded-sm ${isDragging ? "relative z-10 bg-surface-2 shadow-md" : ""}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="mt-1.5 cursor-grab touch-none p-0.5 text-muted opacity-60 hover:opacity-100 active:cursor-grabbing"
        aria-label="Déplacer"
        title="Glisser pour déplacer"
      >
        <IconGrip width={14} height={14} />
      </button>
      <span className="mt-[0.45rem] w-6 shrink-0 text-right text-sm tabular-nums text-muted select-none">{p.marker}</span>
      <textarea
        ref={(el) => {
          ta.current = el;
          p.inputRef(el);
        }}
        rows={1}
        value={p.item.text}
        placeholder={p.placeholder}
        onChange={(e) => p.onText(e.target.value.replace(/\n/g, " "))}
        onKeyDown={p.onKeyDown}
        className="field min-w-0 flex-1 resize-none overflow-hidden py-1.5 leading-snug"
      />
      <div className="mt-0.5 flex shrink-0 items-center opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <IconBtn label="Désindenter (Maj+Tab)" onClick={p.onOutdent} disabled={!p.canOutdent}><IconOutdent /></IconBtn>
        <IconBtn label="Indenter (Tab)" onClick={p.onIndent} disabled={!p.canIndent}><IconIndent /></IconBtn>
        <IconBtn label="Monter (Alt+↑)" onClick={p.onUp} className="hidden sm:inline-flex"><IconUp /></IconBtn>
        <IconBtn label="Descendre (Alt+↓)" onClick={p.onDown} className="hidden sm:inline-flex"><IconDown /></IconBtn>
        <IconBtn label="Supprimer" onClick={p.onDelete} className="hover:text-danger"><IconTrash /></IconBtn>
      </div>
    </li>
  );
}

function IconBtn({ label, onClick, disabled, className = "", children }: { label: string; onClick: () => void; disabled?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`inline-flex rounded-sm p-1.5 text-muted hover:text-ink disabled:opacity-25 ${className}`}>
      {children}
    </button>
  );
}
