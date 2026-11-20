/** Extraction rapide du texte lisible d'une page HTML (sans dépendance). */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim());
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|header|aside|form)\b[\s\S]*?<\/\1>/gi, " ");
  // Les balises de bloc deviennent des sauts de ligne, les cellules des séparateurs.
  s = s
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<(td|th)\b[^>]*>/gi, " | ")
    .replace(/<\/?(p|div|section|article|main|h[1-6]|tr|table|ul|ol|br|pre|blockquote|dd|dt|figcaption)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(s)
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();
  return { title, text };
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", rsquo: "’", lsquo: "‘", laquo: "«", raquo: "»", hellip: "…", ndash: "–", mdash: "—" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}
