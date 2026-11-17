import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildDocx, tint } from "@/lib/docx/builder";
import { importDocx, importFromXml } from "@/lib/docx/import";
import { buildDocModel } from "@/lib/doc-model";
import { DEFAULT_SETTINGS, type Content, type Meta } from "@/lib/schema";

const meta: Meta = {
  nom: "Prosit aller SI - 1",
  theme: "SI : Administration et Sécurité",
  numero: "1",
  bloc: "SI et Sécurité 2026-27",
  date: "2026-11-17",
  auteur: "Dupont Jean",
  groupe: "FISA A3",
};

const li = (text: string, level = 0) => ({ id: Math.random().toString(36).slice(2), text, level });

const content: Content = {
  motsInconnus: [li("Système d'informations"), li("Switch & Routeur <L3>")],
  contexte: "L'entreprise Neo Link…\nDeuxième paragraphe.",
  probleme: "Comment dresser un état des lieux fiable ?",
  contraintes: [li("Infrastructure en production")],
  livrables: [li("Inventaire"), li("Schéma du SI")],
  generalisation: [li("Identification et représentation du SI")],
  pistes: [li("Mauvaise segmentation réseau")],
  etude: [li("Comprendre ce qu'est un S.I.")],
  realisation: [li("Faire l'inventaire"), li("Lister les équipements", 1), li("Lister les services", 1), li("Réaliser le schéma")],
};

async function unzip(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const read = async (p: string) => (await zip.file(p)?.async("string")) ?? "";
  return { zip, read };
}

describe("buildDocx", () => {
  it("produit un .docx valide avec titres, listes et métadonnées", async () => {
    const buf = await buildDocx({ meta, type: "aller", content, settings: DEFAULT_SETTINGS });
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const { read } = await unzip(buf);
    const doc = await read("word/document.xml");
    expect(doc).toContain("Prosit Aller n° 1");
    expect(doc).toContain("Prendre connaissance de la situation et clarifier");
    expect(doc).toContain("Mots inconnus :");
    expect(doc).toContain("Switch &amp; Routeur &lt;L3&gt;");
    expect(doc).toContain("Dupont Jean");
    expect(doc).toContain("17/11/2026");
    expect(doc).toContain('w:pStyle w:val="Heading1"');
    expect(doc).toContain('w:pStyle w:val="ListParagraph"');
    // deux paragraphes pour le contexte
    expect(doc).toContain("Deuxième paragraphe.");

    const styles = await read("word/styles.xml");
    expect(styles).toContain('w:ascii="Arial"');
    expect(styles).toContain("4472C4");
    expect(styles).toContain(tint("#4472C4", 0.4));

    const numbering = await read("word/numbering.xml");
    expect(numbering).toContain('w:val="upperRoman"');
    expect(numbering).toContain('w:val="lowerLetter"');

    const files = Object.keys((await unzip(buf)).zip.files);
    const header = files.find((f) => /word\/header\d*\.xml/.test(f));
    expect(header && (await read(header))).toContain("Prosit aller SI - 1 — SI : Administration et Sécurité");
    const footer = files.find((f) => /word\/footer\d*\.xml/.test(f));
    expect(footer && (await read(footer))).toContain("NUMPAGES");
  });

  it("applique la police choisie dans les réglages", async () => {
    const buf = await buildDocx({ meta, type: "aller", content, settings: { ...DEFAULT_SETTINGS, docFont: "Calibri" } });
    const styles = await (await unzip(buf)).read("word/styles.xml");
    expect(styles).toContain('w:ascii="Calibri"');
  });

  it("le prosit retour a son propre titre", async () => {
    const buf = await buildDocx({ meta, type: "retour", content: { contenu: "Bilan" }, settings: DEFAULT_SETTINGS });
    const doc = await (await unzip(buf)).read("word/document.xml");
    expect(doc).toContain("Prosit Retour n° 1");
    expect(doc).toContain("Bilan");
  });

  it("est ré-importable (aller-retour docx → champs)", async () => {
    const buf = await buildDocx({ meta, type: "aller", content, settings: DEFAULT_SETTINGS });
    const res = await importDocx(buf);
    expect(res.type).toBe("aller");
    expect(res.meta.numero).toBe("1");
    expect(res.content.contexte).toBe("L'entreprise Neo Link…\nDeuxième paragraphe.");
    expect(res.content.probleme).toBe(content.probleme);
    const strip = (v: unknown) => (v as { text: string; level: number }[]).map(({ text, level }) => ({ text, level }));
    for (const k of ["motsInconnus", "contraintes", "livrables", "generalisation", "pistes", "etude", "realisation"]) {
      expect(strip(res.content[k]), k).toEqual(strip(content[k]));
    }
  });
});

describe("importFromXml (styles Word français)", () => {
  const p = (style: string, text: string, num?: { id: number; lvl: number }) =>
    `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${
      num ? `<w:numPr><w:ilvl w:val="${num.lvl}"/><w:numId w:val="${num.id}"/></w:numPr>` : ""
    }</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const xml = `<w:document><w:body>${[
    p("Titre", "Prosit  Aller n° 3"),
    p("Titre1", "Prendre connaissance de la situation et clarifier "),
    p("Titre2", "Mots inconnus :"),
    p("Paragraphedeliste", "Routeur", { id: 24, lvl: 0 }),
    p("Titre2", "Contexte :"),
    p("", "Une PME."),
    p("Titre1", "Analyser le besoin"),
    p("Titre2", "P roblème :"),
    p("", "Comment faire ?"),
    p("Titre2", "Livrables :"),
    p("", "1.   Inventaire"),
    p("", "3 .Schéma (packet tracer)"),
    p("Titre1", "Généralisation "),
    p("Paragraphedeliste", "Représentation du SI", { id: 24, lvl: 0 }),
    p("Titre1", "Plan d’action"),
    p("Titre2", "Etude :", { id: 18, lvl: 0 }),
    p("Paragraphedeliste", "Comprendre un SI", { id: 2, lvl: 1 }),
    p("Titre2", "Réalisation :"),
    p("Paragraphedeliste", "Inventaire", { id: 24, lvl: 0 }),
    p("Paragraphedeliste", "Lister", { id: 2, lvl: 1 }),
  ].join("")}</w:body></w:document>`;

  it("retrouve les rubriques malgré espaces, accents et numérotation manuelle", () => {
    const r = importFromXml(xml);
    const t = (k: string) => (r.content[k] as { text: string; level: number }[]).map((i) => [i.text, i.level]);
    expect(r.type).toBe("aller");
    expect(r.meta.numero).toBe("3");
    expect(t("motsInconnus")).toEqual([["Routeur", 0]]);
    expect(r.content.contexte).toBe("Une PME.");
    expect(r.content.probleme).toBe("Comment faire ?");
    expect(t("livrables")).toEqual([["Inventaire", 0], ["Schéma (packet tracer)", 0]]);
    expect(t("generalisation")).toEqual([["Représentation du SI", 0]]);
    expect(t("etude")).toEqual([["Comprendre un SI", 0]]);
    expect(t("realisation")).toEqual([["Inventaire", 0], ["Lister", 1]]);
  });
});

describe("buildDocModel", () => {
  it("numérote les sections et masque les listes vides", () => {
    const m = buildDocModel(meta, "aller", {});
    expect(m.blocks.filter((b) => b.kind === "h1")).toHaveLength(5);
    expect(m.blocks.some((b) => b.kind === "empty")).toBe(true);
    expect(m.info.find((i) => i.label === "Date")?.value).toBe("17/11/2026");
  });
});
