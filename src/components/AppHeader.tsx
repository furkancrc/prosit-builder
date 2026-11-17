"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toggleColorMode } from "@/lib/theme-client";
import { IconMoon, IconSun } from "./icons";

export function AppHeader({ canLogout }: { canLogout: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  if (pathname === "/login" || pathname.endsWith("/presentation")) return null;

  const nav = [
    { href: "/", label: "Prosits", active: pathname === "/" || pathname.startsWith("/prosits") },
    { href: "/reglages", label: "Réglages", active: pathname.startsWith("/reglages") },
  ];

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 bg-[#111] text-white">
      <div className="mx-auto flex h-14 max-w-[1700px] items-center gap-4 px-4">
        <Link href="/" className="title-cesi text-lg leading-none sm:text-xl">
          <span className="border-b-[3px] border-accent pb-0.5">Prosit Builder</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-sm px-2.5 py-1.5 ${n.active ? "bg-white/10 text-accent" : "text-white/80 hover:text-white"}`}
            >
              {n.label}
            </Link>
          ))}
          <button
            onClick={() => void toggleColorMode()}
            className="rounded-sm p-2 text-white/70 hover:text-white"
            title={`Passer en thème ${dark ? "clair" : "sombre"} (Ctrl+Alt+L)`}
            aria-label={`Passer en thème ${dark ? "clair" : "sombre"}`}
          >
            {dark ? <IconSun /> : <IconMoon />}
          </button>
          {canLogout && (
            <button onClick={logout} className="rounded-sm px-2.5 py-1.5 text-white/60 hover:text-white" title="Se déconnecter">
              <span className="hidden sm:inline">Déconnexion</span>
              <span className="sm:hidden" aria-hidden>⏻</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
