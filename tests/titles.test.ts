import { describe, expect, it } from "vitest";
import { compareProsits, numeroFromFilename, prositLabel, prositTitle } from "@/lib/meta";

describe("titre normalisé d'un prosit (paire aller + retour)", () => {
  it("se calcule à partir du numéro et du thème", () => {
    expect(prositTitle({ numero: "2", theme: "SI et Sécurité" })).toEqual({ title: "Prosit 2", theme: "SI et Sécurité" });
    expect(prositLabel({ numero: "2", theme: "SI et Sécurité" })).toBe("Prosit 2 — SI et Sécurité");
    expect(prositLabel({ numero: "1", theme: "" })).toBe("Prosit 1");
    expect(prositLabel({ numero: " ", theme: "Réseaux" })).toBe("Prosit sans numéro — Réseaux");
  });

  it("trie par numéro croissant, sans numéro à la fin", () => {
    const ps = [
      { numero: "10", date: "" },
      { numero: "", date: "2026-11-01" },
      { numero: "2", date: "" },
      { numero: "1", date: "" },
    ];
    expect([...ps].sort(compareProsits).map((p) => p.numero)).toEqual(["1", "2", "10", ""]);
  });

  it("retrouve le numéro dans un nom de fichier", () => {
    expect(numeroFromFilename("Prosit_aller_SI_-_2.docx")).toBe("2");
    expect(numeroFromFilename("Prosit Retour SI - 1 .docx")).toBe("1");
    expect(numeroFromFilename("PrositRetourPBL2.docx")).toBe("2");
    expect(numeroFromFilename("CER_1_Prosit_3.docx")).toBe("3");
    expect(numeroFromFilename("compte-rendu.docx")).toBeUndefined();
  });
});
