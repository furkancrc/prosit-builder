"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/client-api";

export type SaveStatus = "saved" | "pending" | "saving" | "error";

const MAX_RETRY_DELAY = 30_000;

type Job = { fn: () => Promise<void>; timer: ReturnType<typeof setTimeout> };

/**
 * Sauvegarde automatique avec debounce, par clé (ex. « prosit », « content:<id> »).
 * La dernière fonction planifiée pour une clé remplace la précédente.
 * En cas d'échec réseau / serveur / session, la sauvegarde est retentée automatiquement
 * (2 s, 4 s, 8 s… jusqu'à 30 s) tant qu'une modification plus récente ne l'a pas remplacée :
 * rien n'est perdu pendant un redéploiement ou une coupure.
 */
export function useSaver(delay = 700) {
  const pending = useRef(new Map<string, Job>());
  const inflight = useRef(new Set<Promise<void>>());
  const failing = useRef(new Map<string, { attempts: number; fn: () => Promise<void> }>());
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (failing.current.size) setStatus("error");
    else if (pending.current.size) setStatus("pending");
    else if (inflight.current.size) setStatus("saving");
    else {
      setStatus("saved");
      setError(null);
    }
  }, []);

  const queue = useCallback((key: string, fn: () => Promise<void>, wait: number) => {
    const prev = pending.current.get(key);
    if (prev) clearTimeout(prev.timer);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    pending.current.set(key, { fn, timer: setTimeout(() => void exec(key).catch(() => undefined), wait) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = useCallback(
    (key: string): Promise<void> => {
      const job = pending.current.get(key);
      if (!job) return Promise.resolve();
      clearTimeout(job.timer);
      pending.current.delete(key);
      setStatus("saving");
      const p = job
        .fn()
        .then(() => {
          failing.current.delete(key);
        })
        .catch((e: unknown) => {
          const err = e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : "Erreur inconnue", 0);
          // une modification plus récente est déjà planifiée : c'est elle qui fera foi
          if (pending.current.has(key)) throw err;
          const attempts = (failing.current.get(key)?.attempts ?? 0) + 1;
          failing.current.set(key, { attempts, fn: job.fn });
          if (err.retryable) {
            const wait = Math.min(MAX_RETRY_DELAY, 2000 * 2 ** (attempts - 1));
            queue(key, job.fn, wait);
            setError(`${err.status === 401 ? "Session expirée : reconnecte-toi dans un autre onglet" : err.message}. Nouvel essai dans ${Math.round(wait / 1000)} s.`);
          } else {
            // données refusées par le serveur : inutile de réessayer telles quelles
            setError(err.message);
          }
          throw err;
        })
        .finally(() => {
          inflight.current.delete(p);
          refresh();
        });
      inflight.current.add(p);
      return p;
    },
    [queue, refresh],
  );

  const schedule = useCallback(
    (key: string, fn: () => Promise<void>) => {
      queue(key, fn, delay);
      if (!failing.current.size) setStatus("pending");
    },
    [delay, queue],
  );

  /** Enregistre immédiatement tout ce qui est en attente (avant un export). */
  const flush = useCallback(async () => {
    await Promise.all([...pending.current.keys()].map((k) => exec(k)));
    await Promise.all([...inflight.current]);
    if (failing.current.size) throw new Error(error ?? "Certaines modifications ne sont pas enregistrées");
  }, [exec, error]);

  /** Relance tout de suite les sauvegardes en échec (bouton « Réessayer »). */
  const retry = useCallback(() => {
    for (const [key, f] of failing.current) {
      failing.current.set(key, { attempts: 0, fn: f.fn });
      if (!pending.current.has(key)) queue(key, f.fn, 0);
      else void exec(key).catch(() => undefined);
    }
    for (const key of [...pending.current.keys()]) void exec(key).catch(() => undefined);
  }, [exec, queue]);

  // Revenir en ligne → réessayer aussitôt
  useEffect(() => {
    const onOnline = () => retry();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [retry]);

  // Prévenir avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.size || inflight.current.size || failing.current.size) {
        void flush().catch(() => undefined);
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [flush]);

  return { schedule, flush, retry, status, error };
}

export function SaveIndicator({ status, error, onRetry }: { status: SaveStatus; error: string | null; onRetry?: () => void }) {
  const map: Record<SaveStatus, { label: string; dot: string }> = {
    saved: { label: "Enregistré", dot: "bg-emerald-500" },
    pending: { label: "Modifications…", dot: "bg-accent" },
    saving: { label: "Enregistrement…", dot: "bg-accent animate-pulse" },
    error: { label: "Non enregistré", dot: "bg-danger" },
  };
  const s = map[status];
  return (
    <span className="inline-flex max-w-[22rem] items-center gap-1.5 text-xs text-muted" role="status" aria-live="polite">
      <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
      <span className={status === "error" ? "font-medium text-danger" : ""}>{s.label}</span>
      {status === "error" && error && (
        <span className="hidden truncate lg:inline" title={error}>
          — {error}
        </span>
      )}
      {status === "error" && onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 underline hover:text-ink" title={error ?? undefined}>
          Réessayer
        </button>
      )}
    </span>
  );
}
