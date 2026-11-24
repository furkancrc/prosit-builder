import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { currentMatiere, defaultAnneeId } from "@/lib/dossiers";

describe("règles des dossiers", () => {
  const annees = [
    { id: "a3", matieres: [{ id: "si", nom: "SI", debut: "2026-11-16", fin: "2026-12-18" }, { id: "gl", nom: "GL", debut: "2027-01-25", fin: "2027-02-26" }] },
    { id: "a4", matieres: [] },
  ];
  it("trouve la matière en cours", () => {
    expect(currentMatiere(annees, "2026-11-21")?.id).toBe("si");
    expect(currentMatiere(annees, "2027-01-05")).toBeUndefined();
  });
  it("ouvre l'année en cours, sinon celle d'une matière à venir, sinon la première", () => {
    expect(defaultAnneeId(annees, "2026-12-01")).toBe("a3");
    expect(defaultAnneeId(annees, "2027-01-05")).toBe("a3");
    expect(defaultAnneeId(annees, "2030-01-01")).toBe("a3");
    expect(defaultAnneeId([], "2030-01-01")).toBeUndefined();
  });
});

describe("dossiers en base", () => {
  let db: typeof import("@/lib/db");
  beforeAll(async () => {
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "prosit-test-"));
    db = await import("@/lib/db");
  });

  it("crée FISA A3 à A5 et les 4 blocs de l'A3", () => {
    const d = db.listDossiers();
    expect(d.map((a) => a.nom)).toEqual(["FISA A3", "FISA A4", "FISA A5"]);
    expect(d[0].matieres.map((m) => m.nom)).toEqual([
      "S.I - Sécurité et administration",
      "Génie logiciel",
      "Recherche opérationnelle",
      "Développement d'applications distribuées",
    ]);
    expect(d[0].matieres[0]).toMatchObject({ debut: "2026-11-16", fin: "2026-12-18" });
  });

  it("un prosit créé dans une matière en reprend le bloc et le groupe", () => {
    const si = db.listDossiers()[0].matieres[0];
    const id = db.createProsit({}, undefined, si.id);
    expect(db.getProsit(id)).toMatchObject({ matiereId: si.id, theme: si.nom, bloc: si.nom, groupe: "FISA A3" });
    expect(db.getProsit(db.duplicateProsit(id)!)?.matiereId).toBe(si.id);
    expect(() => db.createProsit({}, undefined, "inconnue")).toThrow(db.UnknownMatiereError);
  });

  it("supprimer une matière ou une année garde les prosits, non classés", () => {
    const a = db.createAnnee("Test");
    const m = db.createMatiere(a, { nom: "Bloc test", debut: "2027-01-01", fin: "" })!;
    const p = db.createProsit({ nom: "à garder" });
    db.setPrositMatiere(p, m);
    expect(db.getProsit(p)?.matiereId).toBe(m);
    expect(db.deleteAnnee(a)).toBe(true);
    expect(db.getProsit(p)).toMatchObject({ nom: "à garder", matiereId: null });
    expect(db.listDossiers().some((x) => x.nom === "Test")).toBe(false);
  });
});
