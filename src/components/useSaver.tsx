"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "saved" | "pending" | "saving" | "error";

/**
 * Sauvegarde automatique avec debounce, par clé (ex. « meta », « doc:<id> »).
 * La dernière fonction planifiée pour une clé remplace la précédente.
 */
export function useSaver(delay = 700) {
  const pending = useRef(new Map<string, { fn: () => Promise<void>; timer: ReturnType<typeof setTimeout> }>());
  const inflight = useRef(new Set<Promise<void>>());
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (pending.current.size) setStatus("pending");
    else if (inflight.current.size) setStatus("saving");
  }, []);

  const exec = useCallback(
    (key: string) => {
      const job = pending.current.get(key);
      if (!job) return Promise.resolve();
      clearTimeout(job.timer);
      pending.current.delete(key);
      setStatus("saving");
      const p = job
        .fn()
        .then(() => setError(null))
        .catch((e: Error) => {
          setError(e.message);
          setStatus("error");
          throw e;
        })
        .finally(() => {
          inflight.current.delete(p);
          if (!pending.current.size && !inflight.current.size) setStatus((s) => (s === "error" ? s : "saved"));
          else refresh();
        });
      inflight.current.add(p);
      return p;
    },
    [refresh],
  );

  const schedule = useCallback(
    (key: string, fn: () => Promise<void>) => {
      const prev = pending.current.get(key);
      if (prev) clearTimeout(prev.timer);
      pending.current.set(key, { fn, timer: setTimeout(() => exec(key).catch(() => undefined), delay) });
      setStatus("pending");
    },
    [delay, exec],
  );

  /** Enregistre immédiatement tout ce qui est en attente (avant un export). */
  const flush = useCallback(async () => {
    await Promise.all([...pending.current.keys()].map((k) => exec(k)));
    await Promise.all([...inflight.current]);
  }, [exec]);

  // Prévenir avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.size || inflight.current.size) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [flush]);

  return { schedule, flush, status, error };
}

export function SaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  const map: Record<SaveStatus, { label: string; dot: string }> = {
    saved: { label: "Enregistré", dot: "bg-emerald-500" },
    pending: { label: "Modifications…", dot: "bg-accent" },
    saving: { label: "Enregistrement…", dot: "bg-accent animate-pulse" },
    error: { label: "Erreur d’enregistrement", dot: "bg-danger" },
  };
  const s = map[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status" aria-live="polite" title={error ?? undefined}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
