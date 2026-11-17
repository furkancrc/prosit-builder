import type { Metadata, Viewport } from "next";
import { Oswald, Poppins } from "next/font/google";
import type { CSSProperties } from "react";
import { getSettings } from "@/lib/db";
import { readableOn } from "@/lib/color";
import { AppHeader } from "@/components/AppHeader";
import { authEnabled } from "@/lib/session";
import "./globals.css";

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-oswald", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-poppins", display: "swap" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prosit Builder",
  description: "Rédaction et export des prosits aller / retour",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const s = getSettings();
  const style = { "--accent": s.accentColor, "--accent-fg": readableOn(s.accentColor) } as CSSProperties;
  return (
    <html lang="fr" className={`${oswald.variable} ${poppins.variable} ${s.colorMode === "dark" ? "dark" : ""}`} style={style}>
      <body className="min-h-dvh antialiased">
        <AppHeader canLogout={authEnabled()} />
        {children}
      </body>
    </html>
  );
}
