/** Erreur d'appel à l'API, avec le code HTTP (0 = réseau injoignable). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
  /** Vaut la peine de réessayer : réseau coupé, serveur indisponible / en redéploiement, session à renouveler. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 401 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

/**
 * Petit client fetch JSON côté navigateur, avec messages d'erreur lisibles.
 * `redirectOn401: false` (sauvegardes automatiques) : pas de redirection vers la connexion,
 * pour ne pas perdre les modifications en cours.
 */
export async function api<T>(url: string, init?: RequestInit, opts: { redirectOn401?: boolean } = {}): Promise<T> {
  const isForm = init?.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: isForm ? init?.headers : { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw new ApiError(navigator.onLine === false ? "Hors ligne" : "Serveur injoignable", 0);
  }
  if (res.status === 401) {
    if (opts.redirectOn401 !== false) window.location.href = "/login";
    throw new ApiError("Session expirée", 401);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const fallback = res.status >= 500 ? `Serveur indisponible (${res.status})` : `Erreur ${res.status}`;
    throw new ApiError(body.error ?? fallback, res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** Variante pour la sauvegarde automatique (sans redirection sur 401). */
export const saveApi = <T,>(url: string, init?: RequestInit) => api<T>(url, init, { redirectOn401: false });
