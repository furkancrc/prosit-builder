import { describe, expect, it } from "vitest";
import { buildCards } from "@/lib/revision";
import { buildQuiz, isRight, quizSignature } from "@/lib/quiz";
import type { Content, ListItem } from "@/lib/schema";

const item = (id: string, text: string, extra: Partial<ListItem> = {}): ListItem => ({ id, text, level: 0, ...extra });

const content: Content = {
  motsCles: [
    item("a", "SI", { detail: "Ensemble organisé de ressources qui traite l’information" }),
    item("b", "ERP", { detail: "Progiciel de gestion intégré" }),
    item("c", "CRM", { detail: "Gestion de la relation client" }),
    item("d", "SGBD", { detail: "Logiciel qui stocke et interroge des bases de données" }),
  ],
  pistes: [
    item("p1", "Le SI se limite à l’informatique", { status: "invalid" }),
    item("p2", "Un ERP centralise les données", { status: "valid" }),
    item("p3", "Le CRM remplace l’ERP", { status: "invalid" }),
    item("p4", "Merise sert à modéliser le SI", { status: "valid" }),
  ],
  realisation: [
    item("r1", "Installer le SGBD", { etapes: ["Télécharger PostgreSQL", "Lancer l’installeur", "Créer un utilisateur"] }),
    item("r2", "Modéliser la base", { etapes: ["Lister les entités", "Dessiner le MCD"] }),
  ],
};

describe("buildQuiz", () => {
  const quiz = buildQuiz(buildCards(content), () => 0.3);

  it("génère des QCM à une réponse pour les définitions, avec 4 propositions dont une bonne", () => {
    const defs = quiz.filter((q) => q.deck === "motsCles");
    expect(defs).toHaveLength(4);
    for (const q of defs) {
      expect(q.kind).toBe("single");
      expect(q.options).toHaveLength(4);
      expect(q.options.filter((o) => o.correct)).toHaveLength(1);
    }
  });

  it("demande le statut de chaque hypothèse et lesquelles sont validées", () => {
    expect(quiz.filter((q) => q.id.startsWith("status:"))).toHaveLength(4);
    const multi = quiz.find((q) => q.deck === "pistes" && q.kind === "multiple")!;
    expect(multi.options.filter((o) => o.correct).map((o) => o.text).sort()).toEqual(["Merise sert à modéliser le SI", "Un ERP centralise les données"]);
  });

  it("mélange les étapes d’une réalisation avec celles d’une autre", () => {
    const q = quiz.find((q) => q.id === "plan:realisation:r1")!;
    expect(q.kind).toBe("multiple");
    expect(q.options.some((o) => o.correct)).toBe(true);
    expect(q.options.some((o) => !o.correct)).toBe(true);
    for (const o of q.options) expect(o.correct).toBe(["Télécharger PostgreSQL", "Lancer l’installeur", "Créer un utilisateur"].includes(o.text));
  });

  it("ne génère rien s’il n’y a pas assez d’éléments pour faire des intrus", () => {
    expect(buildQuiz(buildCards({ motsCles: [item("a", "SI", { detail: "x" }), item("b", "ERP", { detail: "y" })] }))).toEqual([]);
  });
});

describe("isRight", () => {
  const q = { id: "x", deck: "d", kind: "multiple" as const, prompt: "", options: [{ text: "a", correct: true }, { text: "b", correct: false }, { text: "c", correct: true }] };
  it("exige exactement les bonnes réponses", () => {
    expect(isRight(q, [0, 2])).toBe(true);
    expect(isRight(q, [0])).toBe(false);
    expect(isRight(q, [0, 1, 2])).toBe(false);
  });
});

it("quizSignature change quand les cartes changent", () => {
  const a = buildCards(content);
  expect(quizSignature(a)).toBe(quizSignature(buildCards(content)));
  expect(quizSignature(a)).not.toBe(quizSignature(a.slice(1)));
});
