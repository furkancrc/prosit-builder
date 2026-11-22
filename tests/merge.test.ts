import { describe, expect, it } from "vitest";
import { effectiveRetourContent, mergeAllerIntoRetour, sameItem } from "@/lib/templates";
import type { Content, ListItem } from "@/lib/schema";

const li = (text: string, extra: Partial<ListItem> = {}): ListItem => ({ id: Math.random().toString(36).slice(2), text, level: 0, ...extra });
const texts = (c: Content, k: string) => (c[k] as ListItem[]).map((i) => i.text);

describe("sameItem", () => {
  it("reconnaît le même élément malgré accents, casse, ponctuation et gras", () => {
    expect(sameItem("Système d’information", "systeme d'information")).toBe(true);
    expect(sameItem("**Routeur**", "Routeur")).toBe(true);
    // définition tapée dans le texte au retour : même élément que « Routeur » de l'aller
    expect(sameItem("Routeur", "Routeur : équipement qui relie les réseaux")).toBe(true);
    expect(sameItem("NAS", "NAS partagé")).toBe(false); // trop court pour un préfixe fiable
    expect(sameItem("Etat des lieux", "État des lieux de l’existant")).toBe(true);
    expect(sameItem("Calculer moyenne, médiane et écart-type", "Calculer la moyenne, la médiane et l'écart-type")).toBe(true);
    expect(sameItem("Switch", "Serveur")).toBe(false);
  });
});

describe("fusion intelligente aller → retour", () => {
  const aller: Content = {
    contexte: "Emma est stagiaire chez OPTIMAL.",
    probleme: "Comment analyser les données ?",
    roleScribe: "Furkan",
    motsInconnus: [li("CPU"), li("Mémoire"), li("Trafic réseau"), li("Python")],
    contraintes: [li("Données sur 24 h"), li("Fréquence 1 minute")],
    pistes: [li("Calculer la moyenne"), li("Automatiser avec Python")],
  };

  it("complète les champs vides du retour avec ceux de l'aller", () => {
    const c = effectiveRetourContent(aller, {});
    expect(c.contexte).toBe("Emma est stagiaire chez OPTIMAL.");
    expect(c.probleme).toBe("Comment analyser les données ?");
    expect(c.roleScribe).toBe("Furkan");
    expect(texts(c, "contraintes")).toEqual(["Données sur 24 h", "Fréquence 1 minute"]);
  });

  it("garde ce qui est écrit dans le retour (texte, définitions, statuts)", () => {
    const retour: Content = {
      contexte: "Contexte réécrit au retour.",
      motsInconnus: [li("cpu", { detail: "Processeur" })],
      pistes: [li("Calculer la moyenne", { status: "valid", detail: "Fait en TP" })],
    };
    const c = effectiveRetourContent(aller, retour);
    expect(c.contexte).toBe("Contexte réécrit au retour.");
    const mots = c.motsInconnus as ListItem[];
    expect(mots[0]).toMatchObject({ text: "cpu", detail: "Processeur" });
    expect(mots).toHaveLength(4); // pas de doublon « CPU »
    const pistes = c.pistes as ListItem[];
    expect(pistes[0]).toMatchObject({ status: "valid", detail: "Fait en TP" });
    expect(texts(c, "pistes")).toEqual(["Calculer la moyenne", "Automatiser avec Python"]);
  });

  it("insère les éléments manquants à leur place (ordre de l'aller)", () => {
    const retour: Content = {
      motsInconnus: [li("Python", { detail: "Langage" }), li("CPU", { detail: "Processeur" }), li("VLAN", { detail: "Ajouté au retour" })],
    };
    const c = effectiveRetourContent(aller, retour);
    // « Mémoire » et « Trafic réseau » suivaient « CPU » dans l'aller → insérés juste après lui
    expect(texts(c, "motsInconnus")).toEqual(["Python", "CPU", "Mémoire", "Trafic réseau", "VLAN"]);
  });

  it("insère après les sous-éléments de l'élément précédent", () => {
    const a: Content = { realisation: [li("Inventaire"), li("Schéma")] };
    const r: Content = { realisation: [li("Inventaire"), li("Lister les postes", { level: 1 }), li("Rapport final")] };
    expect(texts(effectiveRetourContent(a, r), "realisation")).toEqual(["Inventaire", "Lister les postes", "Schéma", "Rapport final"]);
  });

  it("compte ce qui a été ajouté et ne modifie pas les données d'origine", () => {
    const retour: Content = { motsInconnus: [li("CPU")] };
    const snapshot = JSON.stringify(retour);
    const { added } = mergeAllerIntoRetour(aller, retour);
    expect(added).toBe(3 + 2 + 2 + 3); // 3 mots, 2 contraintes, 2 pistes, contexte + problème + scribe
    expect(JSON.stringify(retour)).toBe(snapshot);
  });
});

import { buildDocModel } from "@/lib/doc-model";

describe("sections du retour", () => {
  const meta = { nom: "P", theme: "T", numero: "1", bloc: "", date: "", auteur: "", groupe: "", lien: "" };
  const titles = (c: Content) =>
    buildDocModel(meta, "retour", c)
      .blocks.filter((b) => b.kind === "section")
      .map((b) => (b.kind === "section" ? `${b.num ?? "-"} ${b.title}` : ""));

  it("masque les sections propres au retour quand elles sont vides", () => {
    const t = titles({});
    expect(t).toContain("VIII PLAN D’ACTION");
    expect(t.some((x) => /SYNTHÈSE|QUESTIONS|AAV|SOURCES/.test(x))).toBe(false);
  });
  it("renumérote les sections affichées", () => {
    const t = titles({ questions: [li("Qu’est-ce qu’un SI ?")], sources: [li("manager-go.com")] });
    expect(t.slice(-2)).toEqual(["IX QUESTIONS DU TUTEUR", "X SOURCES"]);
  });
});
