import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildDocModel } from "@/lib/doc-model";
import { buildDocx } from "@/lib/docx/builder";
import { DEFAULT_SETTINGS, type Content, type ListItem, type Meta } from "@/lib/schema";

const meta: Meta = { nom: "Prosit aller SI - 2", theme: "SI : Administration", numero: "2", bloc: "", date: "", auteur: "", groupe: "", lien: "" };
const li = (text: string, extra: Partial<ListItem> = {}): ListItem => ({ id: Math.random().toString(36).slice(2), text, level: 0, ...extra });
const content: Content = {
  motsCles: [li("OU"), li("GPO")],
  contexte: "Neolink veut uniformiser son administration.",
  probleme: "Comment administrer un SI ?",
  contraintes: [li("Système en production")],
  livrables: [li("POC")],
  generalisation: "Administration S.I.",
  pistes: [li("L’AD résoudra la gestion des accès")],
  etude: [li("Comprendre l’AD")],
  realisation: [li("Setup l’AD")],
};

const outline = (style: "cesi" | "classique") =>
  buildDocModel(meta, "aller", content, style)
    .blocks.filter((b) => b.kind === "section" || b.kind === "h2" || b.kind === "subheading")
    .map((b) => (b.kind === "section" ? `${b.num ?? "-"}. ${style === "classique" ? b.label : b.title}` : b.kind === "h2" ? `  ${b.num}) ${b.text}` : `  ${b.text}`));

describe("styles de mise en page", () => {
  it("classique : rubriques regroupées comme le template Word", () => {
    expect(outline("classique")).toEqual([
      "I. Prendre connaissance de la situation et clarifier",
      "  1) Mots clés :",
      "  2) Mots inconnus :",
      "  3) Contexte :",
      "II. Analyser le besoin",
      "  1) Problème :",
      "  2) Contraintes :",
      "  3) Livrables :",
      "III. Généralisation",
      "IV. Recherche des pistes de solution",
      "V. Plan d’action",
      "  1) Études :",
      "  2) Réalisation :",
    ]);
  });

  it("CESI : rubriques plates I à IX", () => {
    const o = outline("cesi");
    expect(o[0]).toBe("-. RÔLES");
    expect(o).toContain("IX. PLAN D’ACTION");
    expect(o.some((x) => x.includes(")"))).toBe(false);
  });

  it("les rubriques pointent vers la bonne entrée de navigation", () => {
    const m = buildDocModel(meta, "aller", content, "classique");
    const navs = m.blocks.flatMap((b) => (b.kind === "h2" && b.nav ? [`${b.text}→${b.nav}`] : []));
    expect(navs).toContain("Mots clés :→2");
    expect(navs).toContain("Livrables :→7");
  });

  it("l'export Word suit le style choisi", async () => {
    const read = async (style: "cesi" | "classique") => {
      const zip = await JSZip.loadAsync(await buildDocx({ meta, type: "aller", content, settings: { ...DEFAULT_SETTINGS, docStyle: style, docFont: "Calibri" } }));
      const files = Object.keys(zip.files);
      const get = async (re: RegExp) => (await zip.file(files.find((f) => re.test(f)) ?? "")?.async("string")) ?? "";
      return { doc: await get(/word\/document\.xml/), numbering: await get(/word\/numbering\.xml/), footer: await get(/word\/footer\d*\.xml/), header: await get(/word\/header\d*\.xml/) };
    };
    const classic = await read("classique");
    expect(classic.doc).toContain("Prosit Aller n°2");
    expect(classic.doc).toContain("4472C4");
    expect(classic.doc).toContain("Calibri Light");
    expect(classic.doc).not.toContain("PROSIT ALLER"); // pas de bandeau noir
    expect(classic.numbering).toContain('w:val="-"');
    expect(classic.footer).toContain("NUMPAGES");
    expect(classic.header).not.toContain("CESI");

    const cesi = await read("cesi");
    expect(cesi.doc).toContain("PROSIT ALLER");
    expect(cesi.header).toContain("CESI");
    expect(cesi.numbering).toContain('w:val="■"');
  });
});

describe("style Rapport (Times)", () => {
  it("reprend la mise en page de PrositRetourPBL2", async () => {
    const m = buildDocModel(meta, "retour", content, "rapport");
    expect(m.heading).toBe("Prosit retour / CER :");
    expect(buildDocModel(meta, "retour", content, "classique").heading).toBe("Prosit Retour / CER n°2");
    expect(buildDocModel(meta, "retour", content, "cesi").banner).toBe("PROSIT RETOUR / CER");
    expect(buildDocModel(meta, "aller", content, "rapport").heading).toBe("Prosit aller :");
    expect(m.pbl).toBe("Boucle PBL 2 : SI : Administration");
    const zip = await JSZip.loadAsync(
      await buildDocx({ meta, type: "retour", content, settings: { ...DEFAULT_SETTINGS, docStyle: "rapport", docFont: "Times New Roman" } }),
    );
    const doc = (await zip.file("word/document.xml")?.async("string")) ?? "";
    const numbering = (await zip.file("word/numbering.xml")?.async("string")) ?? "";
    expect(doc).toContain("Prosit retour / CER :");
    expect(doc).toContain("Boucle PBL 2 : SI : Administration");
    expect(doc).toContain("D0583A"); // titres orange
    expect(doc).toContain("Prendre connaissance de la situation et clarifier.");
    expect(doc).toContain('<w:u w:val="single"/>'); // sous-titres soulignés
    expect(doc).toContain('w:ascii="Times New Roman"');
    expect(numbering).toContain('w:val="•"');
  });
});
