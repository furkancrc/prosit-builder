import type { ListItem, PisteStatus } from "../schema";
import { cleanText, SIMILAR, similarity } from "./text";

/** Symboles de statut tapés au début d'une hypothèse → statut. */
const SYMBOLS: Record<string, PisteStatus> = { "✔": "valid", "✓": "valid", "☑": "valid", "◐": "partial", "✘": "invalid", "✗": "invalid", "❌": "invalid" };
const LEADING_SYMBOLS = /^\s*([✔✓☑◐✘✗❌]️?\s*)+/;

/**
 * Met en forme les hypothèses (pistes de solution) :
 * - symboles ✔ ◐ ✘ retirés du texte (le statut en est déduit s'il est vide) ;
 * - justification collée dans le texte (« … → justification », ou « … : justification » après au moins
 *   6 mots) déplacée dans le champ justification s'il est vide ;
 * - doublons fusionnés (similarité ≥ 0,8) : on garde la version qui a un statut, avec la justification la plus longue.
 */
export function formatHypotheses(items: ListItem[]): ListItem[] {
  const cleaned: ListItem[] = [];
  for (const it of items) {
    let text = it.text;
    let status = it.status;
    const sym = LEADING_SYMBOLS.exec(text);
    if (sym) {
      const first = [...sym[0].trim()][0];
      if (!status && SYMBOLS[first]) status = SYMBOLS[first];
      text = text.slice(sym[0].length);
    }
    let detail = it.detail?.trim() ? it.detail : "";
    if (!detail) {
      const arrow = text.indexOf("→");
      if (arrow > 0) {
        detail = text.slice(arrow + 1);
        text = text.slice(0, arrow);
      } else {
        const colon = /^((?:\S+\s+){6,}?\S*?)\s*:\s+(.+)$/.exec(text);
        if (colon) {
          text = colon[1];
          detail = colon[2];
        }
      }
    }
    text = cleanText(text.replace(/\s*\n\s*/g, " "));
    detail = detail
      .split(/\r?\n/)
      .map((l) => cleanText(l))
      .filter(Boolean)
      .join("\n");
    if (!text && !detail) continue;
    const out: ListItem = { ...it, text, level: 0 };
    if (status) out.status = status;
    else delete out.status;
    if (detail) out.detail = detail;
    else delete out.detail;
    cleaned.push(out);
  }

  // dédoublonnage : chaque groupe d'hypothèses semblables prend la place de sa première occurrence
  const result: ListItem[] = [];
  const used = new Set<number>();
  cleaned.forEach((h, i) => {
    if (used.has(i)) return;
    const group = [h];
    for (let j = i + 1; j < cleaned.length; j++) {
      if (!used.has(j) && similarity(h.text, cleaned[j].text) >= SIMILAR) {
        group.push(cleaned[j]);
        used.add(j);
      }
    }
    const score = (x: ListItem) => (x.status ? 100000 : 0) + (x.detail?.length ?? 0);
    const best = group.reduce((a, b) => (score(b) > score(a) ? b : a));
    const longest = group.reduce((a, b) => ((b.detail?.length ?? 0) > (a.detail?.length ?? 0) ? b : a));
    const merged: ListItem = { ...best };
    if (longest.detail) merged.detail = longest.detail;
    if (!merged.status) {
      const withStatus = group.find((g) => g.status);
      if (withStatus) merged.status = withStatus.status;
    }
    if (!merged.blocks?.length) {
      const withBlocks = group.find((g) => g.blocks?.length);
      if (withBlocks) merged.blocks = withBlocks.blocks;
    }
    result.push(merged);
  });
  return result;
}
