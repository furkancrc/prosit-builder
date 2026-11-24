import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildDocx } from "@/lib/docx/builder";
import { formatProsit } from "@/lib/format";
import { DEFAULT_SETTINGS, type Content, type ListItem, type Meta } from "@/lib/schema";

const meta: Meta = { nom: "", theme: "SI et Sécurité", numero: "3", bloc: "", date: "", auteur: "", groupe: "", lien: "" };
const li = (text: string, extra: Partial<ListItem> = {}): ListItem => ({ id: Math.random().toString(36).slice(2), text, level: 0, ...extra });

// prosit retour n° 3 « fourre-tout », tel qu'il était enregistré avant la mise en forme
const brut: Content = {
  contexte: "Analyser le besoin.\nNeoLink veut uniformiser son administration.",
  pistes: [
    li("✔ L'arbre des dossiers correspond à l'AD → bonne pratique : l'arborescence reflète l'organigramme"),
    li("L’arbre des dossiers correspond à l’AD (correspond au service : dossier = service)", { status: "valid", detail: "L'arborescence reflète l'organigramme." }),
    li("Les droits sont donnés utilisateur par utilisateur", { status: "partial", detail: "Vrai en partie.\nIl existe aussi des groupes." }),
  ],
  etude: [
    li("Définir la méthode AGDLP", {
      detail:
        "La méthode AGDLP est la bonne pratique Microsoft pour gérer les droits d'accès :\n- A (Account) : les comptes utilisateurs sont placés dans des groupes Globaux\n- G (Global) : ces groupes globaux sont imbriqués dans des groupes Domaine Local\nAvantage : on modifie uniquement le groupe global.",
    }),
    li("Comprendre les droits NFS"),
    li("Comprendre les droits NTFS", { detail: "Permissions NTFS et héritage." }),
  ],
  realisation: [
    li("Créer les dossiers partagés", { detail: "1. Créer l'arborescence (un dossier par service : Compta, RH)\n2. Créer les groupes AD selon AGDLP" }),
    li("Configurer les GPO", { detail: "1. Créer une GPO par service\n2. La lier à l'OU" }),
  ],
};

async function exportXml(style: "cesi" | "classique" | "rapport", source: Content = brut) {
  const content = formatProsit(source, "retour");
  const zip = await JSZip.loadAsync(await buildDocx({ meta, type: "retour", content, settings: { ...DEFAULT_SETTINGS, docStyle: style } }));
  return {
    doc: (await zip.file("word/document.xml")?.async("string")) ?? "",
    numbering: (await zip.file("word/numbering.xml")?.async("string")) ?? "",
  };
}

/** Paragraphe (<w:p>) qui contient ce texte. */
const paraWith = (doc: string, text: string) => (doc.match(/<w:p>[\s\S]*?<\/w:p>|<w:p [\s\S]*?<\/w:p>/g) ?? []).find((p) => p.includes(text)) ?? "";

/** Format (decimal, bullet…) du niveau 0 de la numérotation numId. */
function numFormat(numbering: string, numId: string): string | undefined {
  const abs = new RegExp(`<w:num w:numId="${numId}"[^>]*>[\\s\\S]*?<w:abstractNumId w:val="(\\d+)"`).exec(numbering)?.[1];
  const block = new RegExp(`<w:abstractNum [^>]*w:abstractNumId="${abs}"[\\s\\S]*?</w:abstractNum>`).exec(numbering)?.[0] ?? "";
  return /<w:lvl w:ilvl="0"[\s\S]*?<w:numFmt w:val="(\w+)"/.exec(block)?.[1];
}

describe("export Word d'un prosit mis en forme", () => {
  for (const style of ["cesi", "classique", "rapport"] as const) {
    it(`style ${style} : pas de saut de ligne dans un run, vraies listes`, async () => {
      const { doc, numbering } = await exportXml(style);
      // aucun retour à la ligne dans un texte, aucun <w:br/> pour simuler une liste
      for (const t of doc.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? []) expect(t).not.toMatch(/\n/);
      expect(doc).not.toContain("<w:br/>");

      // étapes : numérotation décimale, qui repart à 1 pour chaque élément (numId différents)
      const s1 = paraWith(doc, "Créer l&apos;arborescence") || paraWith(doc, "Créer l'arborescence");
      const s2 = paraWith(doc, "Créer une GPO par service");
      const id1 = /<w:numId w:val="(\d+)"/.exec(s1)?.[1];
      const id2 = /<w:numId w:val="(\d+)"/.exec(s2)?.[1];
      expect(id1 && numFormat(numbering, id1)).toBe("decimal");
      expect(id1).not.toBe(id2);

      // points : puces de niveau 1, libellé en gras
      const point = paraWith(doc, "A (Account)");
      expect(point).toContain('<w:ilvl w:val="1"/>');
      expect(point).toMatch(/<w:b\/>[\s\S]*?A \(Account\)/);

      // intérêt et description en paragraphes à part, sans puce
      const interet = paraWith(doc, "Intérêt :");
      expect(interet).not.toContain("<w:numPr>");
      expect(interet).toContain("On modifie uniquement le groupe global.");

      // hypothèses fusionnées (une seule « L'arbre des dossiers »), justification dans un paragraphe séparé
      expect((doc.match(/arbre des dossiers correspond/g) ?? []).length).toBe(1);
      const justif = paraWith(doc, "Il existe aussi des groupes.");
      expect(justif).not.toContain("<w:numPr>");

      // élément vide en double supprimé, paragraphe parasite retiré du contexte
      expect(doc).not.toContain("droits NFS");
      // (le style Rapport garde « Analyser le besoin. » comme titre de groupe : on compare à un contexte sans ce reste)
      const propre = await exportXml(style, { ...brut, contexte: "NeoLink veut uniformiser son administration." });
      const count = (x: string) => (x.match(/Analyser le besoin/g) ?? []).length;
      expect(count(doc)).toBe(count(propre.doc));
    });
  }
});
