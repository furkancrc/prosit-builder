import { describe, expect, it } from "vitest";
import { answer, buildCards, reconcile, startSession } from "@/lib/revision";
import type { Content } from "@/lib/schema";

describe("buildCards", () => {
  it("crée une carte par élément qui a un verso", () => {
    const content: Content = {
      motsCles: [
        { id: "a", text: "SI", level: 0, detail: "Système d’information" },
        { id: "b", text: "Sans définition", level: 0 },
      ],
      pistes: [{ id: "p", text: "Le SI est l’informatique", level: 0, status: "invalid" }],
      etude: [{ id: "e", text: "Merise", level: 0, points: [{ label: "MCD", texte: "modèle conceptuel" }] }],
      contexte: "texte libre",
    };
    const cards = buildCards(content);
    expect(cards.map((c) => c.id)).toEqual(["motsCles:a", "pistes:p", "etude:e"]);
    expect(cards[0].back).toEqual(["Système d’information"]);
    expect(cards[1].status).toBe("invalid");
  });
});

describe("séance", () => {
  it("renvoie une carte ratée en fin de paquet jusqu’à validation", () => {
    let s = startSession(["a", "b", "c"]);
    s = answer(s, false); // a ratée
    expect(s.queue).toEqual(["b", "c", "a"]);
    s = answer(s, true);
    s = answer(s, true);
    expect(s.queue).toEqual(["a"]);
    s = answer(s, false);
    expect(s.queue).toEqual(["a"]);
    s = answer(s, true);
    expect(s.queue).toEqual([]);
    expect(s.known).toEqual(["b", "c", "a"]);
    expect(s.misses).toEqual({ a: 2 });
  });

  it("retire les cartes supprimées du prosit", () => {
    const s = answer(startSession(["a", "b", "c"]), true);
    expect(reconcile(s, ["a", "c"])).toMatchObject({ queue: ["c"], known: ["a"], total: 2 });
    expect(reconcile(s, ["z"])).toBeNull();
  });
});
