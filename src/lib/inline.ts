/** Découpe un texte en segments gras / normaux selon la syntaxe **gras** (comme Markdown). */
export function splitBold(text: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const re = /\*\*([^*\n]+?)\*\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out.length ? out : [{ text, bold: false }];
}

/** Texte sans les marqueurs ** (comparaisons, noms de fichiers…). */
export function stripBold(text: string): string {
  return text.replace(/\*\*([^*\n]+?)\*\*/g, "$1");
}
