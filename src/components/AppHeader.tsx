"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function AppHeader({ canLogout }: { canLogout: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/login") return null;

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
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4">
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
          {canLogout && (
            <button onClick={logout} className="rounded-sm px-2.5 py-1.5 text-white/60 hover:text-white" title="Se déconnecter">
              Déconnexion
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
