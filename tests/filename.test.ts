import { describe, expect, it } from "vitest";
import { buildFilename, sanitizeFilename, shortTheme, withExtension } from "@/lib/filename";
import { effectiveMeta, deriveNomForType } from "@/lib/meta";
import { normalizeList, type Meta } from "@/lib/schema";

const meta: Meta = {
  nom: "Prosit aller SI - 1",
  theme: "SI : Administration et Sécurité",
  numero: "1",
  bloc: "SI et Sécurité 2026-27",
  date: "2026-11-17",
  auteur: "Çiçek Élodie",
  groupe: "FISA A3",
  lien: "",
};

describe("nom de fichier", () => {
  it("applique le gabarit par défaut", () => {
    expect(buildFilename("Prosit_{type}_{theme}_-_{numero}", meta, "aller")).toBe("Prosit_aller_SI_-_1");
    expect(buildFilename("Prosit_{type}_{theme}_-_{numero}", meta, "retour")).toBe("Prosit_retour_SI_-_1");
  });
  it("retire accents et caractères interdits", () => {
    expect(sanitizeFilename('Sécurité: <réseau> "A/B" | été?*')).toBe("Securite_reseau_A_B_ete");
    expect(buildFilename("{nom} {auteur}", meta, "aller")).toBe("Prosit_aller_SI_-_1_Cicek_Elodie");
    expect(buildFilename("{themeComplet}", meta, "aller")).toBe("SI_Administration_et_Securite");
  });
  it("gère les noms réservés et vides", () => {
    expect(sanitizeFilename("CON")).toBe("_CON");
    expect(sanitizeFilename("???")).toBe("prosit");
  });
  it("ajoute une seule extension", () => {
    expect(withExtension("Mon prosit.docx", "docx")).toBe("Mon_prosit.docx");
    expect(withExtension("Mon prosit", "pdf")).toBe("Mon_prosit.pdf");
  });
  it("thème court", () => {
    expect(shortTheme("Réseaux – Routage")).toBe("Réseaux");
    expect(shortTheme("Big Data")).toBe("Big Data");
  });
});

describe("métadonnées", () => {
  it("le retour hérite de l'aller et dérive son nom", () => {
    expect(deriveNomForType("Prosit aller SI - 1", "retour")).toBe("Prosit retour SI - 1");
    expect(deriveNomForType("Prosit Aller SI", "retour")).toBe("Prosit Retour SI");
    const m = effectiveMeta(meta, "retour", { date: "2026-11-24" });
    expect(m.nom).toBe("Prosit retour SI - 1");
    expect(m.date).toBe("2026-11-24");
    expect(m.theme).toBe(meta.theme);
  });
  it("une surcharge du nom l'emporte", () => {
    expect(effectiveMeta(meta, "retour", { nom: "Autre" }).nom).toBe("Autre");
  });
});

describe("normalizeList", () => {
  it("borne les niveaux", () => {
    const r = normalizeList([
      { id: "a", text: "a", level: 2 },
      { id: "b", text: "b", level: 2 },
      { id: "c", text: "c", level: 0 },
    ]);
    expect(r.map((i) => i.level)).toEqual([0, 1, 0]);
  });
});

import { mergeAllerIntoRetour, isContentEmpty } from "@/lib/templates";

describe("reprise de l'aller dans le retour", () => {
  const aller = {
    contexte: "Contexte aller",
    roleScribe: "Furkan",
    motsCles: [{ id: "a", text: "Accès", level: 0 }, { id: "b", text: "CPU", level: 0 }],
  };
  it("pré-remplit un retour vide", () => {
    const { content, added } = mergeAllerIntoRetour(aller, {});
    expect(added).toBe(4);
    expect(content.contexte).toBe("Contexte aller");
    expect((content.motsCles as { text: string }[]).map((i) => i.text)).toEqual(["Accès", "CPU"]);
    expect(isContentEmpty(content)).toBe(false);
  });
  it("n'écrase rien et garde les définitions", () => {
    const retour = {
      contexte: "Contexte du retour",
      motsCles: [{ id: "x", text: "accès ", level: 0, detail: "Définition gardée" }],
    };
    const { content, added } = mergeAllerIntoRetour(aller, retour);
    expect(content.contexte).toBe("Contexte du retour");
    const mots = content.motsCles as { text: string; detail?: string }[];
    expect(mots).toHaveLength(2);
    expect(mots[0].detail).toBe("Définition gardée");
    expect(added).toBe(2); // rôle scribe + « CPU »
  });
});
