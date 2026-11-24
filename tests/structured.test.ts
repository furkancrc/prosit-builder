import { describe, expect, it } from "vitest";
import { genKindFor, JSON_SCHEMAS, parseStructured, patchToMarkdown, stripThink, structuredTask } from "@/lib/ai/structured";

describe("génération structurée (Perplexity JSON)", () => {
  it("choisit le type de génération selon le champ", () => {
    expect(genKindFor({ plan: true })).toBe("plan");
    expect(genKindFor({ status: true, detail: "Justification" })).toBe("justification");
    expect(genKindFor({ detail: "Définition" })).toBe("definition");
    expect(genKindFor({})).toBeNull();
  });

  it("schémas sans récursion, prompts sans Markdown demandé", () => {
    for (const s of Object.values(JSON_SCHEMAS)) expect(JSON.stringify(s.schema)).not.toContain("$ref");
    expect(structuredTask({ kind: "plan", section: "Plan d'action", fieldLabel: "Études", text: "Définir AGDLP" })).toContain('"etapes"');
  });

  it("élément du plan : JSON valide → structure nettoyée", () => {
    const raw = `<think>je réfléchis…</think>{"titre":"définir la méthode AGDLP","description":"Bonne pratique **Microsoft** [1].","points":[{"label":"A (Account)","texte":"comptes utilisateurs"},{"texte":"  "}],"etapes":["1. Créer les groupes","Affecter les droits"],"interet":"Intérêt : on modifie un seul groupe."}`;
    const { patch, warning } = parseStructured("plan", raw);
    expect(warning).toBeUndefined();
    expect(patch.text).toBe("Définir la méthode AGDLP");
    expect(patch.description).toBe("Bonne pratique Microsoft.");
    expect(patch.points).toEqual([{ label: "A (Account)", texte: "Comptes utilisateurs" }]);
    expect(patch.etapes).toEqual(["Créer les groupes", "Affecter les droits"]);
    expect(patch.interet).toBe("On modifie un seul groupe.");
  });

  it("élément du plan : réponse non JSON → parseur déterministe + avertissement", () => {
    const raw = "Créer les dossiers partagés\nUn dossier par service.\n1. Créer l'arborescence\n2. Créer les groupes AD\nAvantage : gestion simple";
    const { patch, warning } = parseStructured("plan", raw);
    expect(warning).toMatch(/non structurée/);
    expect(patch.text).toBe("Créer les dossiers partagés");
    expect(patch.etapes).toEqual(["Créer l'arborescence", "Créer les groupes AD"]);
    expect(patch.interet).toBe("Gestion simple");
  });

  it("justification : statut converti, texte sur une ligne", () => {
    const { patch } = parseStructured("justification", '```json\n{"statut":"partielle","justification":"Vrai en partie.\\nIl existe aussi des groupes [2]."}\n```');
    expect(patch).toEqual({ status: "partial", detail: "Vrai en partie. Il existe aussi des groupes." });
  });

  it("définition : JSON invalide → texte nettoyé sans Markdown", () => {
    const { patch, warning } = parseStructured("definition", "**NTFS** est le système de fichiers de Windows [1].");
    expect(warning).toBeDefined();
    expect(patch.detail).toBe("NTFS est le système de fichiers de Windows.");
    expect(stripThink("<think>x</think> ok")).toBe("ok");
  });

  it("aperçu lisible dans la discussion", () => {
    expect(patchToMarkdown({ text: "Titre", points: [{ label: "L", texte: "t" }], etapes: ["a"] })).toBe("**Titre**\n\n- **L** : t\n\n1. a");
  });
});
