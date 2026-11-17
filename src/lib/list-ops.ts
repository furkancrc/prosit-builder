import { MAX_LEVEL, normalizeList, type ListItem } from "./schema";

/** Index de fin (exclu) du sous-arbre qui commence à `i`. */
export function subtreeEnd(items: ListItem[], i: number): number {
  let j = i + 1;
  while (j < items.length && items[j].level > items[i].level) j++;
  return j;
}

/** Déplace l'élément `from` et ses sous-éléments à la position de `to` (indices de la liste actuelle). */
export function moveItem(items: ListItem[], from: number, to: number): ListItem[] {
  if (from === to) return items;
  const end = subtreeEnd(items, from);
  if (to >= from && to < end) return items; // pas dans son propre sous-arbre
  const block = items.slice(from, end);
  const rest = [...items.slice(0, from), ...items.slice(end)];
  // position d'insertion dans `rest`
  let at: number;
  if (to < from) at = to;
  else at = subtreeEnd(items, to) - block.length; // après le sous-arbre de la cible
  const prevLevel = at > 0 ? rest[at - 1].level : -1;
  const delta = Math.min(block[0].level, prevLevel + 1) - block[0].level;
  const shifted = block.map((b) => ({ ...b, level: Math.max(0, Math.min(MAX_LEVEL, b.level + delta)) }));
  return normalizeList([...rest.slice(0, at), ...shifted, ...rest.slice(at)]);
}

/** Décale un élément (et son sous-arbre) d'un niveau. */
export function shiftLevel(items: ListItem[], i: number, dir: 1 | -1): ListItem[] {
  const it = items[i];
  const prevLevel = i > 0 ? items[i - 1].level : -1;
  const target = it.level + dir;
  if (target < 0 || target > MAX_LEVEL || target > prevLevel + 1) return items;
  const end = subtreeEnd(items, i);
  if (dir === 1 && items.slice(i, end).some((x) => x.level + 1 > MAX_LEVEL)) return items;
  return normalizeList(items.map((x, k) => (k >= i && k < end ? { ...x, level: x.level + dir } : x)));
}

/** Monte / descend un élément parmi ses voisins de même niveau. */
export function moveSibling(items: ListItem[], i: number, dir: 1 | -1): ListItem[] {
  const level = items[i].level;
  if (dir === -1) {
    let j = i - 1;
    while (j >= 0 && items[j].level > level) j--;
    if (j < 0 || items[j].level < level) return items;
    return moveItem(items, i, j);
  }
  const end = subtreeEnd(items, i);
  if (end >= items.length || items[end].level < level) return items;
  return moveItem(items, i, end);
}

export function newItemId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
