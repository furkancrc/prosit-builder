import { describe, expect, it } from "vitest";
import { moveItem, moveSibling, shiftLevel } from "@/lib/list-ops";
import type { ListItem } from "@/lib/schema";

const L = (spec: string): ListItem[] =>
  spec.split(",").map((s) => {
    const level = s.length - s.trimStart().length;
    return { id: s.trim(), text: s.trim(), level };
  });
const show = (items: ListItem[]) => items.map((i) => " ".repeat(i.level) + i.id).join(",");

describe("opérations sur les listes", () => {
  const base = L("a, a1, a2,b,c, c1");

  it("déplace un élément avec ses sous-éléments vers le bas", () => {
    expect(show(moveItem(base, 0, 3))).toBe("b,a, a1, a2,c, c1");
  });
  it("déplace vers le haut", () => {
    expect(show(moveItem(base, 4, 0))).toBe("c, c1,a, a1, a2,b");
  });
  it("refuse de déposer un élément dans son propre sous-arbre", () => {
    expect(moveItem(base, 0, 1)).toBe(base);
  });
  it("un sous-élément déplacé en tête redevient niveau 0", () => {
    expect(show(moveItem(base, 1, 0))).toBe("a1,a, a2,b,c, c1");
  });
  it("indente / désindente avec le sous-arbre", () => {
    expect(show(shiftLevel(base, 3, 1))).toBe("a, a1, a2, b,c, c1");
    expect(show(shiftLevel(base, 0, 1))).toBe(show(base)); // premier élément : impossible
    expect(show(shiftLevel(L("a, b,  c"), 1, -1))).toBe("a,b, c");
  });
  it("monte / descend parmi les frères", () => {
    expect(show(moveSibling(base, 3, -1))).toBe("b,a, a1, a2,c, c1");
    expect(show(moveSibling(base, 1, 1))).toBe("a, a2, a1,b,c, c1");
    expect(moveSibling(base, 2, 1)).toBe(base); // dernier enfant
  });
});
