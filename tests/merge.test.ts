import { describe, expect, it } from "vitest";
import { RETOUR_TEMPLATE, coerceContent, effectiveRetourContent, mergeAllerIntoRetour, sameItem } from "@/lib/templates";
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
    motsCles: [li("CPU"), li("Mémoire"), li("Trafic réseau"), li("Python")],
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
      motsCles: [li("cpu", { detail: "Processeur" })],
      pistes: [li("Calculer la moyenne", { status: "valid", detail: "Fait en TP" })],
    };
    const c = effectiveRetourContent(aller, retour);
    expect(c.contexte).toBe("Contexte réécrit au retour.");
    const mots = c.motsCles as ListItem[];
    expect(mots[0]).toMatchObject({ text: "cpu", detail: "Processeur" });
    expect(mots).toHaveLength(4); // pas de doublon « CPU »
    const pistes = c.pistes as ListItem[];
    expect(pistes[0]).toMatchObject({ status: "valid", detail: "Fait en TP" });
    expect(texts(c, "pistes")).toEqual(["Calculer la moyenne", "Automatiser avec Python"]);
  });

  it("insère les éléments manquants à leur place (ordre de l'aller)", () => {
    const retour: Content = {
      motsCles: [li("Python", { detail: "Langage" }), li("CPU", { detail: "Processeur" }), li("VLAN", { detail: "Ajouté au retour" })],
    };
    const c = effectiveRetourContent(aller, retour);
    // « Mémoire » et « Trafic réseau » suivaient « CPU » dans l'aller → insérés juste après lui
    expect(texts(c, "motsCles")).toEqual(["Python", "CPU", "Mémoire", "Trafic réseau", "VLAN"]);
  });

  it("insère après les sous-éléments de l'élément précédent", () => {
    const a: Content = { realisation: [li("Inventaire"), li("Schéma")] };
    const r: Content = { realisation: [li("Inventaire"), li("Lister les postes", { level: 1 }), li("Rapport final")] };
    expect(texts(effectiveRetourContent(a, r), "realisation")).toEqual(["Inventaire", "Lister les postes", "Schéma", "Rapport final"]);
  });

  it("compte ce qui a été ajouté et ne modifie pas les données d'origine", () => {
    const retour: Content = { motsCles: [li("CPU")] };
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
    expect(t).toContain("IX PLAN D’ACTION");
    expect(t.some((x) => /SYNTHÈSE|QUESTIONS|AAV|SOURCES/.test(x))).toBe(false);
  });
  it("renumérote les sections affichées", () => {
    const t = titles({ questions: [li("Qu’est-ce qu’un SI ?")], sources: [li("manager-go.com")] });
    expect(t.slice(-2)).toEqual(["X QUESTIONS DU TUTEUR", "XI SOURCES"]);
  });
});

import { mergeImported, retourToAller } from "@/lib/templates";
import { importFromXml } from "@/lib/docx/import";

describe("import intelligent (fusion, jamais de remplacement)", () => {
  const existing: Content = {
    contexte: "Emma est stagiaire chez OPTIMAL.",
    probleme: "Comment analyser les données ?",
    motsCles: [li("CPU", { detail: "Processeur" }), li("Mémoire"), li("Python")],
    pistes: [li("Calculer la moyenne", { status: "valid" })],
  };

  it("ne perd rien de l'existant et complète avec le fichier", () => {
    const imported: Content = {
      contexte: "",
      probleme: "Une autre problématique formulée autrement",
      motsCles: [li("cpu", { detail: "Unité centrale" }), li("Mémoire", { detail: "RAM" }), li("Trafic réseau", { detail: "Débit" })],
      pistes: [li("Calculer la moyenne", { status: "partial", detail: "Fait en TP" }), li("Visualiser les données", { status: "invalid" })],
    };
    const { content, stats } = mergeImported("retour", existing, imported);
    expect(content.contexte).toBe("Emma est stagiaire chez OPTIMAL."); // vide dans le fichier → gardé
    expect(content.probleme).toBe("Comment analyser les données ?"); // différent → l'existant est gardé
    expect(stats.kept).toEqual(["Problématique"]);
    const mots = content.motsCles as ListItem[];
    expect(mots.map((m) => [m.text, m.detail])).toEqual([
      ["CPU", "Processeur"], // définition existante conservée
      ["Mémoire", "RAM"], // définition ajoutée
      ["Trafic réseau", "Débit"], // nouvel élément inséré après « Mémoire »
      ["Python", undefined],
    ]);
    const pistes = content.pistes as ListItem[];
    expect(pistes[0]).toMatchObject({ status: "valid", detail: "Fait en TP" }); // statut existant gardé, justification ajoutée
    expect(pistes[1]).toMatchObject({ text: "Visualiser les données", status: "invalid" });
    expect(stats.added).toBe(2);
    expect(stats.enriched).toBe(2);
  });

  it("prend la version la plus complète d'un même texte", () => {
    const { content, stats } = mergeImported("aller", { contexte: "Emma est stagiaire." }, { contexte: "Emma est stagiaire. Elle doit analyser 24 h de données." });
    expect(content.contexte).toBe("Emma est stagiaire. Elle doit analyser 24 h de données.");
    expect(stats.enriched).toBe(1);
  });

  it("reconstitue un aller à partir d'un retour (sans définitions ni statuts)", () => {
    const a = retourToAller({ contexte: "C", pistes: [li("P", { status: "valid", detail: "d", blocks: [{ id: "t", type: "text", text: "x" }] })], questions: [li("Q")] });
    expect(a.contexte).toBe("C");
    expect(a.pistes).toEqual([{ id: expect.any(String), text: "P", level: 0 }]);
    expect(a.questions).toBeUndefined(); // rubrique propre au retour
  });

  it("le type lu dans le fichier l'emporte sur l'onglet ouvert", () => {
    const p = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
    const retourXml = `<w:document><w:body>${p("PROSIT RETOUR / CER")}${p("I MOTS CLÉS")}${p("■ CPU : processeur")}</w:body></w:document>`;
    expect(importFromXml(retourXml, "aller").type).toBe("retour");
    const aavXml = `<w:document><w:body>${p("Mots clés :")}${p("XI AAV")}${p("[3] Schématiser")}</w:body></w:document>`;
    expect(importFromXml(aavXml, "aller").type).toBe("retour");
    const neutre = `<w:document><w:body>${p("Contexte")}${p("Texte")}</w:body></w:document>`;
    expect(importFromXml(neutre, "retour").type).toBe("retour"); // aucun indice dans le fichier → onglet
  });
});

describe("fusion : hypothèses reformulées au retour", () => {
  it("n'ajoute pas les formulations de l'aller quand toutes les hypothèses ont un statut", () => {
    const a: Content = { pistes: [li("La mise en place des l'accès aux dossier partagé se fait via des GPO"), li("Il faut deux serveurs")] };
    const r: Content = {
      pistes: [
        li("L'accès aux dossiers partagés sur le réseau se met en place via des GPO", { status: "valid", detail: "Les GPO montent les lecteurs." }),
        li("Il faut deux serveurs pour répartir les tâches", { status: "partial", detail: "Pas obligatoire." }),
      ],
    };
    expect(texts(effectiveRetourContent(a, r), "pistes")).toEqual([
      "L'accès aux dossiers partagés sur le réseau se met en place via des GPO",
      "Il faut deux serveurs pour répartir les tâches",
    ]);
  });
});

describe("mots clés / mots inconnus", () => {
  it("un ancien prosit (mots clés rangés sous motsInconnus) garde sa rubrique Mots clés", () => {
    const c = coerceContent(RETOUR_TEMPLATE, { motsInconnus: [li("CPU", { detail: "Processeur" })] });
    expect(texts(c, "motsCles")).toEqual(["CPU"]);
    expect(c.motsInconnus).toEqual([]);
  });
  it("un prosit récent garde les deux rubriques séparées", () => {
    const c = coerceContent(RETOUR_TEMPLATE, { motsCles: [li("PRA")], motsInconnus: [li("NAS")] });
    expect(texts(c, "motsCles")).toEqual(["PRA"]);
    expect(texts(c, "motsInconnus")).toEqual(["NAS"]);
  });
});
