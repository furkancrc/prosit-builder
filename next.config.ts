import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Permet de lancer une seconde instance (tests) sans écraser le .next du serveur de dev.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
