"use client";

import { usePathname } from "next/navigation";

export const AUTHOR = {
  name: "Furkan Ciraci",
  github: "https://github.com/furkancrc",
  linkedin: "https://www.linkedin.com/in/furkan-ciraci/",
};

/** Mention légale en bas de page (masquée dans la vue de présentation projetée). */
export function AppFooter() {
  const pathname = usePathname();
  if (pathname.endsWith("/presentation")) return null;
  return (
    <footer className="mt-12 border-t border-line px-4 py-5 text-center text-xs text-muted">
      <p>
        Construit par <strong className="text-ink">{AUTHOR.name}</strong> ·{" "}
        <a href={AUTHOR.github} target="_blank" rel="noopener noreferrer" className="underline decoration-accent decoration-2 underline-offset-2 hover:text-ink">
          GitHub
        </a>{" "}
        ·{" "}
        <a href={AUTHOR.linkedin} target="_blank" rel="noopener noreferrer" className="underline decoration-accent decoration-2 underline-offset-2 hover:text-ink">
          LinkedIn
        </a>
      </p>
      <p className="mt-1">
        © {new Date().getFullYear()} {AUTHOR.name}. Projet étudiant indépendant, non affilié au CESI. « CESI » est une marque de son propriétaire.
      </p>
    </footer>
  );
}
