import { MAX_LEVEL, normalizeList, type ListItem } from "../schema";

/** Langage du bloc de code dans lequel l'assistant met le contenu prêt à insérer. */
export const INSERT_FENCE = "prosit";

/** Contenu prêt à insérer : le dernier bloc ```prosit``` de la réponse, sinon null. */
export function extractInsertable(answer: string): string | null {
  const re = new RegExp("```" + INSERT_FENCE + "[^\\n]*\\n([\\s\\S]*?)```", "g");
  let last: string | null = null;
  for (const m of answer.matchAll(re)) last = m[1];
  return last === null ? null : stripCitations(last).trim();
}

export function stripCitations(s: string): string {
  return s.replace(/\s?\[\d+(?:[,\s]+\d+)*\]/g, "");
}

const MARKER = /^(?:[-*•■▪◦]|\d+[.)]|[a-z][.)]|[ivx]+[.)])\s+/i;

/**
 * Transforme du texte en éléments de liste : l'indentation (2 espaces ou 1 tabulation) donne le niveau,
 * les puces et numéros sont retirés. Si le champ a une définition, « terme : définition » est séparé.
 */
export function textToListItems(text: string, opts: { withDetail: boolean; newId: () => string }): ListItem[] {
  const items: ListItem[] = [];
  for (const raw of stripCitations(text).split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indent = raw.match(/^[ \t]*/)![0].replace(/\t/g, "  ").length;
    const body = raw.trim();
    const hasMarker = MARKER.test(body);
    let line = body.replace(MARKER, "").trim();
    if (!line) continue;
    // Ligne sans puce sous un élément : suite de sa définition / de son texte.
    const prev = items[items.length - 1];
    if (!hasMarker && prev && indent > 0) {
      if (opts.withDetail) prev.detail = prev.detail ? `${prev.detail}\n${line}` : line;
      else prev.text = `${prev.text} ${line}`;
      continue;
    }
    const level = Math.min(MAX_LEVEL, Math.floor(indent / 2));
    const item: ListItem = { id: opts.newId(), text: line, level };
    if (opts.withDetail) {
      const m = line.match(/^(\*\*[^*]+\*\*|[^:]{1,120}?)\s*(?::|—|–)\s+(.+)$/);
      if (m) {
        item.text = m[1].replace(/^\*\*|\*\*$/g, "").trim();
        item.detail = m[2].trim();
      }
    } else {
      line = line.replace(/^\*\*([^*]+)\*\*$/, "$1");
      item.text = line;
    }
    items.push(item);
  }
  return normalizeList(items);
}

/** Texte à insérer dans un champ texte : on retire puces et marqueurs de citation. */
export function textForTextField(text: string): string {
  return stripCitations(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s+/, "").trimEnd())
    .join("\n")
    .trim();
}
