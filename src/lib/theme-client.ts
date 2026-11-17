"use client";

import type { Settings } from "./schema";

/** Bascule clair / sombre immédiatement et enregistre le choix dans les réglages. */
export async function toggleColorMode(): Promise<"light" | "dark"> {
  const root = document.documentElement;
  const next = root.classList.contains("dark") ? "light" : "dark";
  root.classList.toggle("dark", next === "dark");
  try {
    const current = (await (await fetch("/api/settings")).json()) as Settings;
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...current, colorMode: next }),
    });
  } catch {
    // le changement visuel reste appliqué ; il sera perdu au rechargement
  }
  return next;
}
