"use client";

import { useCallback, useRef, useState } from "react";

const COALESCE_MS = 800;
const MAX_HISTORY = 200;

/**
 * État avec historique annuler / rétablir.
 * Les modifications successives d'un même champ (même `group`) à moins de 800 ms
 * sont regroupées en une seule étape, comme une frappe continue.
 */
export function useHistory<T>(initial: () => T) {
  const [state, setState] = useState<T>(initial);
  const current = useRef(state);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const last = useRef<{ group: string; at: number } | null>(null);
  const [, bump] = useState(0);

  const commit = useCallback((next: T, group?: string) => {
    const now = Date.now();
    const coalesce = group && last.current?.group === group && now - last.current.at < COALESCE_MS;
    if (!coalesce) {
      past.current.push(current.current);
      if (past.current.length > MAX_HISTORY) past.current.shift();
    }
    future.current = [];
    last.current = group ? { group, at: now } : null;
    current.current = next;
    setState(next);
    bump((n) => n + 1);
  }, []);

  const undo = useCallback((): T | null => {
    const prev = past.current.pop();
    if (prev === undefined) return null;
    future.current.push(current.current);
    current.current = prev;
    last.current = null;
    setState(prev);
    bump((n) => n + 1);
    return prev;
  }, []);

  const redo = useCallback((): T | null => {
    const next = future.current.pop();
    if (next === undefined) return null;
    past.current.push(current.current);
    current.current = next;
    last.current = null;
    setState(next);
    bump((n) => n + 1);
    return next;
  }, []);

  return {
    state,
    /** Valeur à jour même entre deux rendus (pour les gestionnaires d'événements). */
    get: () => current.current,
    commit,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
