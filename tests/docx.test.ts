import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildDocx } from "@/lib/docx/builder";
import { importDocx, importFromXml } from "@/lib/docx/import";
import { buildDocModel } from "@/lib/doc-model";
import { DEFAULT_SETTINGS, type Content, type Meta } from "@/lib/schema";

const meta: Meta = {
  nom: "Prosit aller Stats OS - 1",
  theme: "Stats OS : Clefs de Performance",
  numero: "1",
  bloc: "SI et Sécurité 2026-27",
  date: "2026-11-17",
  auteur: "Dupont Jean",
  groupe: "FISA A3",
  lien: "",
};

const li = (text: string, level = 0) => ({ id: Math.random().toString(36).slice(2), text, level });

const content: Content = {
  roleAnimateur: "Alice",
  roleSecretaire: "Bruno",
  roleScribe: "Furkan",
  roleGestionnaire: "Bruno",
  motsInconnus: [li("Statistiques descriptives"), li("Switch & Routeur <L3>")],
  contexte: "Emma est stagiaire…\nDeuxième paragraphe.",
  probleme: "Comment analyser statistiquement les données ?",
  contraintes: [li("Données sur 24 h")],
  livrables: [li("Script Python d'analyse"), li("Seuils de vigilance")],
  generalisation: "Statistiques descriptives",
  pistes: [li("Calculer moyenne, médiane, écart-type")],
  etude: [li("Lecture des documents")],
  realisation: [li("Charger le CSV"), li("Lister les colonnes", 1), li("Nettoyer", 1), li("Tracer les graphiques")],
};

async function unzip(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const read = async (p: string) => (await zip.file(p)?.async("string")) ?? "";
  const find = (re: RegExp) => Object.keys(zip.files).find((f) => re.test(f));
  return { zip, read, find };
}

describe("buildDocx (modèle Boucle PBL)", () => {
  it("reproduit la structure du modèle", async () => {
    const buf = await buildDocx({ meta, type: "aller", content, settings: DEFAULT_SETTINGS });
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const { read, find } = await unzip(buf);
    const doc = await read("word/document.xml");

    expect(doc).toContain("PROSIT ALLER");
    expect(doc).toContain('w:fill="000000"'); // bandeau noir
    expect(doc).toContain("Boucle PBL : Stats OS : Clefs de Performance");
    expect(doc).toContain('w:fill="FFE600"'); // bloc titre / repères à la couleur d'accent
    expect(doc).toContain("RÔLES");
    expect(doc).toContain("Animateur : Alice");
    for (const t of ["MOTS CLÉS", "CONTEXTE", "PROBLÉMATIQUE", "CONTRAINTES", "LIVRABLES", "GÉNÉRALISATION", "PISTES DE SOLUTION", "PLAN D’ACTION"]) {
      expect(doc, t).toContain(t);
    }
    expect(doc).toMatch(/>VIII <\/w:t>/); // numéro romain de la 8e section
    expect(doc).toContain('w:color w:val="EE85A0"'); // numéros en rose
    expect(doc).toContain("Études :");
    expect(doc).toContain("Switch &amp; Routeur &lt;L3&gt;");
    expect(doc).toContain("Prosit n° 1");
    expect(doc).toContain("17/11/2026");
    expect(doc).toContain('w:w="11906"'); // A4

    const numbering = await read("word/numbering.xml");
    expect(numbering).toContain('w:val="■"');
    expect(numbering).toContain("EE85A0");

    const header = find(/word\/header\d*\.xml/);
    const h = header ? await read(header) : "";
    expect(h).toContain("CESI");
    expect(h).toContain("_ÉCOLE D&apos;INGÉNIEURS");
    const footer = find(/word\/footer\d*\.xml/);
    const f = footer ? await read(footer) : "";
    expect(f).toContain("PROSIT  _  ");
    expect(f).toContain("PAGE");
  });

  it("applique la police et les couleurs des réglages", async () => {
    const buf = await buildDocx({
      meta,
      type: "aller",
      content,
      settings: { ...DEFAULT_SETTINGS, docFont: "Calibri", accentColor: "#22C55E", docSecondaryColor: "#111111" },
    });
    const { read } = await unzip(buf);
    const doc = await read("word/document.xml");
    expect(doc).toContain('w:ascii="Calibri"');
    expect(doc).toContain('w:fill="22C55E"');
    expect(doc).not.toContain("EE85A0");
  });

  it("le prosit retour exporte définitions, surlignages, images, tableaux et se ré-importe", async () => {
    // PNG 1×1 valide
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const assets = new Map([
      ["img-a", { type: "png" as const, mime: "image/png", width: 1, height: 1, data: png }],
      ["img-b", { type: "png" as const, mime: "image/png", width: 1, height: 1, data: png }],
    ]);
    const retour: Content = {
      ...content,
      motsInconnus: [{ ...li("Accès"), detail: "Possibilité d’utiliser une ressource" }, li("CPU")],
      pistes: [
        { ...li("Segmentation réseau"), status: "valid", detail: "Confirmé par le schéma" },
        { ...li("DHCP mal paramétré"), status: "partial", blocks: [{ id: "t1", type: "text", text: "C'est partiellement vrai." }] },
        { ...li("Rôles par adresse IP"), status: "invalid" },
      ],
      etude: [
        {
          ...li("Réaliser le schéma du SI"),
          blocks: [
            { id: "i1", type: "images", columns: 1, images: [{ assetId: "img-a", caption: "Schéma Packet Tracer" }] },
            { id: "i2", type: "images", columns: 2, images: [{ assetId: "img-a", caption: "Étoile" }, { assetId: "img-b", caption: "Bus" }] },
            { id: "tb", type: "table", header: true, rows: [["Composante", "Exemples"], ["Matériel", "postes, serveurs"]] },
          ],
        },
        li("Rappel des rôles"),
      ],
      questions: [{ ...li("Qu’est-ce qu’un SI ?"), detail: "Voir au-dessus" }],
      objectifs: [{ ...li("[3] Schématiser le SI"), status: "valid" }, { ...li("[4] Cartographie"), status: "partial" }],
    };
    const buf = await buildDocx({ meta, type: "retour", content: retour, settings: DEFAULT_SETTINGS, assets });
    const { read, zip } = await unzip(buf);
    const doc = await read("word/document.xml");
    expect(doc).toContain("PROSIT RETOUR");
    expect(doc).toContain("PROSIT RETOUR / CER");
    expect(doc).toContain(">Mot clé<"); // mots clés en tableau (format CER)
    expect(doc).toContain(">Possibilité d’utiliser une ressource<");
    expect(doc).toContain('w:fill="9BE89B"'); // surlignage vert
    expect(doc).toContain('w:fill="FFC870"'); // orange
    expect(doc).toContain('w:fill="FF8A8A"'); // rouge
    expect(doc).toContain("Partiellement validée"); // légende
    expect(doc).toContain("QUESTIONS DU TUTEUR");
    expect(doc).toMatch(/>X <\/w:t>[\s\S]*?AAV/);
    expect(doc).toContain("Schéma Packet Tracer");
    expect(doc).toContain("<w:drawing>");
    expect(Object.keys(zip.files).filter((f) => f.startsWith("word/media/")).length).toBeGreaterThanOrEqual(1);

    // ré-import : définitions, statuts, paragraphes, images et tableau retrouvés
    let n = 0;
    const back = await importDocx(buf, "retour", () => `asset-${++n}`);
    type It = { text: string; detail?: string; status?: string; blocks?: { type: string; columns?: number; images?: { caption: string }[]; rows?: string[][]; text?: string }[] };
    const get = (k: string) => back.content[k] as It[];
    expect(get("motsInconnus").map((i) => [i.text, i.detail])).toEqual([
      ["Accès", "Possibilité d’utiliser une ressource"],
      ["CPU", undefined],
    ]);
    expect(get("pistes").map((i) => [i.text, i.status])).toEqual([
      ["Segmentation réseau", "valid"],
      ["DHCP mal paramétré", "partial"],
      ["Rôles par adresse IP", "invalid"],
    ]);
    expect(get("pistes")[1].blocks?.[0]).toMatchObject({ type: "text", text: "C'est partiellement vrai." });
    const blocks = get("etude")[0].blocks ?? [];
    expect(blocks.map((b) => b.type)).toEqual(["images", "images", "table"]);
    expect(blocks[0].images?.[0].caption).toBe("Schéma Packet Tracer");
    expect(blocks[1]).toMatchObject({ columns: 2 });
    expect(blocks[1].images?.map((i) => i.caption)).toEqual(["Étoile", "Bus"]);
    expect(blocks[2].rows).toEqual([["Composante", "Exemples"], ["Matériel", "postes, serveurs"]]);
    expect(get("etude").map((i) => i.text)).toEqual(["Réaliser le schéma du SI", "Rappel des rôles"]);
    expect(get("questions").map((i) => [i.text, i.detail])).toEqual([["Qu’est-ce qu’un SI ?", "Voir au-dessus"]]);
    expect(get("objectifs").map((i) => [i.text, i.status])).toEqual([
      ["[3] Schématiser le SI", "valid"],
      ["[4] Cartographie", "partial"],
    ]);
  });

  it("l'aller n'exporte ni définitions ni statuts", async () => {
    const c: Content = { ...content, pistes: [{ ...li("Piste"), status: "valid", detail: "x" }] };
    const doc = await (await unzip(await buildDocx({ meta, type: "aller", content: c, settings: DEFAULT_SETTINGS }))).read("word/document.xml");
    expect(doc).not.toContain("2E7D32");
    expect(doc).not.toContain("Partiellement validée");
  });

  it("est ré-importable (docx → champs)", async () => {
    const buf = await buildDocx({ meta, type: "aller", content, settings: DEFAULT_SETTINGS });
    const res = await importDocx(buf);
    expect(res.type).toBe("aller");
    expect(res.meta.numero).toBe("1");
    expect(res.meta.theme).toBe(meta.theme);
    for (const k of ["roleAnimateur", "roleSecretaire", "roleScribe", "roleGestionnaire", "contexte", "probleme", "generalisation"]) {
      expect(res.content[k], k).toBe(content[k]);
    }
    const strip = (v: unknown) => (v as { text: string; level: number }[]).map(({ text, level }) => ({ text, level }));
    for (const k of ["motsInconnus", "contraintes", "livrables", "pistes", "etude", "realisation"]) {
      expect(strip(res.content[k]), k).toEqual(strip(content[k]));
    }
  });
});

const p = (style: string, text: string, num?: { id: number; lvl: number }) =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${
    num ? `<w:numPr><w:ilvl w:val="${num.lvl}"/><w:numId w:val="${num.id}"/></w:numPr>` : ""
  }</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const doc = (paras: string[]) => `<w:document><w:body>${paras.join("")}</w:body></w:document>`;
const t = (r: { content: Content }, k: string) => (r.content[k] as { text: string; level: number }[]).map((i) => [i.text, i.level]);

describe("import du format « Boucle PBL » (titres en tableau, puces ■ en texte)", () => {
  const xml = doc([
    p("", "PROSIT ALLER"),
    p("", "Boucle PBL : Stats OS : Clefs de Performance"),
    p("", "RÔLES"),
    p("", "■ Animateur : Alice"),
    p("", "■ Gestionnaire du temps : Bruno"),
    p("", "I MOTS CLEES "),
    p("", "■ CPU"),
    p("", "■ Python"),
    p("", "II CONTEXTE"),
    p("", "Emma est stagiaire."),
    p("", "III PROBLEMATIQUE"),
    p("", "Comment analyser ?"),
    p("", "IV CONTRAINTE"),
    p("", "■ Données sur 24 h"),
    p("", "V LIVRABLE"),
    p("", "■ Script Python"),
    p("", "VI GENERALISATION"),
    p("", "Statistiques descriptives"),
    p("", "VII PISTE DE SOLUTIONS"),
    p("", "■ Calculer la moyenne"),
    p("", "VIII PLAN D'ACTION"),
    p("", "Études :"),
    p("", "■ Lecture des documents"),
    p("", "Réalisation :"),
    p("", "■ Charger le CSV"),
  ]);

  it("retrouve rôles, rubriques et métadonnées", () => {
    const r = importFromXml(xml);
    expect(r.type).toBe("aller");
    expect(r.meta.theme).toBe("Stats OS : Clefs de Performance");
    expect(r.content.roleAnimateur).toBe("Alice");
    expect(r.content.roleGestionnaire).toBe("Bruno");
    expect(t(r, "motsInconnus")).toEqual([["CPU", 0], ["Python", 0]]);
    expect(r.content.contexte).toBe("Emma est stagiaire.");
    expect(r.content.probleme).toBe("Comment analyser ?");
    expect(t(r, "contraintes")).toEqual([["Données sur 24 h", 0]]);
    expect(t(r, "livrables")).toEqual([["Script Python", 0]]);
    expect(r.content.generalisation).toBe("Statistiques descriptives");
    expect(t(r, "pistes")).toEqual([["Calculer la moyenne", 0]]);
    expect(t(r, "etude")).toEqual([["Lecture des documents", 0]]);
    expect(t(r, "realisation")).toEqual([["Charger le CSV", 0]]);
  });
});

describe("import de l'ancien format (styles Titre 1 / Titre 2)", () => {
  const xml = doc([
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
    p("Titre1", "Recherche des pistes de solution"),
    p("Paragraphedeliste", "Segmentation", { id: 24, lvl: 0 }),
    p("Titre1", "Plan d’action"),
    p("Titre2", "Etude :", { id: 18, lvl: 0 }),
    p("Paragraphedeliste", "Comprendre un SI", { id: 2, lvl: 1 }),
    p("Titre2", "Réalisation :"),
    p("Paragraphedeliste", "Inventaire", { id: 24, lvl: 0 }),
    p("Paragraphedeliste", "Lister", { id: 2, lvl: 1 }),
  ]);

  it("retrouve les rubriques malgré espaces, accents et numérotation manuelle", () => {
    const r = importFromXml(xml);
    expect(r.type).toBe("aller");
    expect(r.meta.numero).toBe("3");
    expect(t(r, "motsInconnus")).toEqual([["Routeur", 0]]);
    expect(r.content.contexte).toBe("Une PME.");
    expect(r.content.probleme).toBe("Comment faire ?");
    expect(t(r, "livrables")).toEqual([["Inventaire", 0], ["Schéma (packet tracer)", 0]]);
    expect(r.content.generalisation).toBe("Représentation du SI");
    expect(t(r, "pistes")).toEqual([["Segmentation", 0]]);
    expect(t(r, "etude")).toEqual([["Comprendre un SI", 0]]);
    expect(t(r, "realisation")).toEqual([["Inventaire", 0], ["Lister", 1]]);
  });
});

describe("buildDocModel", () => {
  it("numérote les sections sauf Rôles et signale les champs vides", () => {
    const m = buildDocModel(meta, "aller", {});
    const sections = m.blocks.filter((b) => b.kind === "section");
    expect(sections).toHaveLength(9);
    expect(sections[0]).toMatchObject({ title: "RÔLES", num: undefined });
    expect(sections[8]).toMatchObject({ num: "VIII" });
    expect(m.blocks.some((b) => b.kind === "empty")).toBe(true);
    expect(m.title).toBe("Boucle PBL : Stats OS : Clefs de Performance");
    expect(m.info).toContain("17/11/2026");
  });
});
