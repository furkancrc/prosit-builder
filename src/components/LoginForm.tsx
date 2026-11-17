"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("erreur") === "config" ? "APP_PASSWORD n’est pas configuré sur le serveur : l’accès est bloqué." : null,
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Connexion impossible");
      return;
    }
    const next = params.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-sm bg-surface p-6 text-ink shadow-xl">
      <label htmlFor="pw" className="mb-1 block text-xs font-medium text-muted">
        Mot de passe
      </label>
      <input id="pw" type="password" autoComplete="current-password" autoFocus className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <button className="btn btn-primary mt-5 w-full justify-center" disabled={busy || !password}>
        {busy ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
