import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  LevelFormat,
  LevelSuffix,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  type ILevelsOptions,
} from "docx";
import { STATUS_META, type Content, type DocType, type ListItem, type Meta, type PisteStatus, type RichBlock, type Settings } from "../schema";
import { splitBold, stripBold } from "../inline";
import { buildDocModel, type Block } from "../doc-model";
import { fitSize, type ImageInfo } from "../image-info";
import type { ListStyle } from "../templates";

/**
 * Mise en page reprise du modèle « Prosit_Aller_Stats_OS.docx » :
 * en-tête « CESI _ÉCOLE D'INGÉNIEURS » souligné en jaune, bandeau noir « PROSIT ALLER »,
 * bloc jaune « Boucle PBL : … », sections avec repère jaune + filet noir, puces ■ roses,
 * pied de page « PROSIT _ n ».
 */

const hex = (c: string) => c.replace("#", "").toUpperCase();

function readableOn(color: string): string {
  const n = parseInt(hex(color), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "000000" : "FFFFFF";
}

// Dimensions du modèle (twips, A4)
const PAGE_W = 11906;
const MARGIN_X = 1134;
const CONTENT_W = PAGE_W - 2 * MARGIN_X; // 9638
const LIST_LEFT = 510;
const LIST_HANG = 283;
const LIST_STEP = 397;

// Tailles (demi-points)
const SZ_BODY = 21; // 10,5 pt
const SZ_SECTION = 30; // 15 pt
const SZ_TITLE = 40; // 20 pt
const SZ_BANNER = 22; // 11 pt
const SZ_BULLET = 14; // 7 pt

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const TABLE_NO_BORDERS = { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE };

export interface BuildOptions {
  meta: Meta;
  type: DocType;
  content: Content;
  settings: Pick<Settings, "docFont" | "docSecondaryColor" | "accentColor">;
  /** Images utilisées par les blocs riches, préchargées (identifiant → données). */
  assets?: Map<string, ImageInfo & { data: Buffer }>;
}

export function buildDocument({ meta, type, content, settings, assets }: BuildOptions): Document {
  const model = buildDocModel(meta, type, content);
  const font = settings.docFont;
  const accent = hex(settings.accentColor);
  const secondary = hex(settings.docSecondaryColor);

  const run = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) =>
    new TextRun({ text, font, bold: o.bold ?? false, italics: o.italics, size: o.size ?? SZ_BODY, color: o.color ?? "000000" });

  /** Texte avec **gras** en ligne. */
  const runs = (text: string, o: { bold?: boolean; size?: number } = {}) =>
    splitBold(text).map((seg) => run(seg.text, { ...o, bold: o.bold || seg.bold }));

  /** Texte surligné (fond coloré) selon le statut validée / partielle / non validée. */
  const hl = (text: string, st: PisteStatus, o: { bold?: boolean; size?: number } = {}) =>
    new TextRun({
      text,
      font,
      bold: o.bold ?? false,
      size: o.size ?? SZ_BODY,
      color: "000000",
      shading: { type: ShadingType.CLEAR, color: "auto", fill: hex(STATUS_META[st].highlight) },
    });

  // ---------- contenu riche (prosit retour) : texte, images, tableaux ----------
  const TWIP_PER_PX = 15; // 96 dpi
  const imageRun = (assetId: string, maxWidthTwips: number) => {
    const a = assets?.get(assetId);
    if (!a) return run("[image introuvable]", { italics: true, color: "999999" });
    const { width, height } = fitSize(a.width, a.height, Math.floor(maxWidthTwips / TWIP_PER_PX), 620);
    return new ImageRun({ type: a.type, data: a.data, transformation: { width, height } });
  };
  const caption = (text: string) =>
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 120 }, children: [run(text, { italics: true, size: 18 })] });

  /** Mots clés du retour / CER : tableau « Mot clé | Définition », images éventuelles en dessous. */
  const keywordTable = (items: ListItem[], headers: [string, string]): (Paragraph | Table)[] => {
    const line = { style: BorderStyle.SINGLE, size: 4, color: "808080" } as const;
    const w1 = Math.round(CONTENT_W * 0.34);
    const cell = (children: Paragraph[], w: number, head = false) =>
      new TableCell({
        width: { size: w, type: WidthType.DXA },
        margins: { top: 40, bottom: 40, left: 90, right: 90 },
        shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: accent } : undefined,
        children,
      });
    const p = (children: TextRun[]) => new Paragraph({ spacing: { after: 0 }, children });
    const table = new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [w1, CONTENT_W - w1],
      layout: TableLayoutType.FIXED,
      borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
      rows: [
        new TableRow({
          tableHeader: true,
          children: headers.map((h, i) => cell([p([run(h, { bold: true, color: readableOn(settings.accentColor) })])], i ? CONTENT_W - w1 : w1, true)),
        }),
        ...items.map(
          (it) =>
            new TableRow({
              cantSplit: true,
              children: [cell([p(runs(it.text, { bold: true }))], w1), cell((it.detail ?? "").split(/\r?\n/).map((l) => p(runs(l))), CONTENT_W - w1)],
            }),
        ),
      ],
    });
    // contenu riche éventuel d'un mot clé (schéma…) : sous le tableau, précédé du mot clé
    const extra = items.flatMap((it) =>
      it.blocks?.length
        ? [new Paragraph({ keepNext: true, spacing: { before: 120, after: 40 }, children: runs(it.text, { bold: true }) }), ...it.blocks.flatMap((rb) => richBlock(rb, 0))]
        : [],
    );
    return [table, spacer(100), ...extra];
  };

  const richBlock = (rb: RichBlock, indent: number): (Paragraph | Table)[] => {
    const avail = CONTENT_W - indent;
    if (rb.type === "text") {
      return rb.text
        .split(/\r?\n/)
        .map((line) => new Paragraph({ indent: { left: indent }, spacing: { after: 60, line: 276 }, children: runs(line) }));
    }
    if (rb.type === "images") {
      const cols = Math.max(1, Math.min(rb.columns, rb.images.length));
      if (cols === 1) {
        return rb.images.flatMap((im) => [
          new Paragraph({ alignment: AlignmentType.CENTER, keepNext: !!im.caption, spacing: { before: 80, after: im.caption ? 0 : 120 }, children: [imageRun(im.assetId, avail)] }),
          ...(im.caption ? [caption(im.caption)] : []),
        ]);
      }
      const colW = Math.floor(avail / cols);
      const rows: TableRow[] = [];
      for (let i = 0; i < rb.images.length; i += cols) {
        const chunk = rb.images.slice(i, i + cols);
        rows.push(
          new TableRow({
            cantSplit: true,
            children: Array.from({ length: cols }, (_, c) => {
              const im = chunk[c];
              return new TableCell({
                width: { size: colW, type: WidthType.DXA },
                borders: NO_BORDERS,
                margins: { top: 60, bottom: 60, left: 80, right: 80 },
                children: im
                  ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [imageRun(im.assetId, colW - 160)] }), ...(im.caption ? [caption(im.caption)] : [])]
                  : [new Paragraph({ children: [] })],
              });
            }),
          }),
        );
      }
      return [
        new Table({ width: { size: avail, type: WidthType.DXA }, columnWidths: Array(cols).fill(colW), layout: TableLayoutType.FIXED, indent: { size: indent, type: WidthType.DXA }, borders: TABLE_NO_BORDERS, rows }),
        spacer(80),
      ];
    }
    // tableau
    const ncols = Math.max(1, ...rb.rows.map((r) => r.length));
    const colW = Math.floor(avail / ncols);
    const line = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" } as const;
    return [
      new Table({
        width: { size: avail, type: WidthType.DXA },
        columnWidths: Array(ncols).fill(colW),
        layout: TableLayoutType.FIXED,
        indent: { size: indent, type: WidthType.DXA },
        borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
        rows: rb.rows.map(
          (r, ri) =>
            new TableRow({
              tableHeader: rb.header && ri === 0,
              cantSplit: true,
              children: Array.from({ length: ncols }, (_, ci) => {
                const head = rb.header && ri === 0;
                return new TableCell({
                  width: { size: colW, type: WidthType.DXA },
                  margins: { top: 50, bottom: 50, left: 90, right: 90 },
                  shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: "F2F2F2" } : undefined,
                  children: (r[ci] ?? "").split(/\r?\n/).map((t) => new Paragraph({ spacing: { after: 0 }, children: runs(t, { bold: head, size: 19 }) })),
                });
              }),
            }),
        ),
      }),
      spacer(100),
    ];
  };

  // ---------- numérotation (puces ■ roses, sous-niveaux numérotés) ----------
  const markerRun = { bold: true, color: secondary, size: SZ_BULLET, font };
  const numRun = { bold: true, color: secondary, size: SZ_BODY, font };
  const lvl = (level: number, format: (typeof LevelFormat)[keyof typeof LevelFormat], text: string): ILevelsOptions => ({
    level,
    format,
    text,
    alignment: AlignmentType.LEFT,
    suffix: LevelSuffix.SPACE,
    style: {
      run: format === LevelFormat.BULLET ? markerRun : numRun,
      paragraph: { indent: { left: LIST_LEFT + level * LIST_STEP, hanging: LIST_HANG } },
    },
  });
  const numbering: Record<ListStyle, ILevelsOptions[]> = {
    bullet: [lvl(0, LevelFormat.BULLET, "■"), lvl(1, LevelFormat.BULLET, "■"), lvl(2, LevelFormat.BULLET, "■")],
    numbered: [lvl(0, LevelFormat.DECIMAL, "%1."), lvl(1, LevelFormat.LOWER_LETTER, "%2."), lvl(2, LevelFormat.LOWER_ROMAN, "%3.")],
    "bullet-numbered": [lvl(0, LevelFormat.BULLET, "■"), lvl(1, LevelFormat.DECIMAL, "%2."), lvl(2, LevelFormat.LOWER_LETTER, "%3.")],
  };

  // ---------- blocs ----------
  const spacer = (after: number) => new Paragraph({ spacing: { after, before: 0 }, children: [] });

  const sectionHeading = (title: string, num?: string) =>
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [340, CONTENT_W - 340],
      layout: TableLayoutType.FIXED,
      borders: TABLE_NO_BORDERS,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: 340, type: WidthType.DXA },
              borders: NO_BORDERS,
              shading: { type: ShadingType.CLEAR, color: "auto", fill: accent },
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              children: [new Paragraph({ keepNext: true, spacing: { after: 0 }, children: [run(" ", { size: 24 })] })],
            }),
            new TableCell({
              width: { size: CONTENT_W - 340, type: WidthType.DXA },
              borders: { ...NO_BORDERS, bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
              margins: { top: 60, bottom: 60, left: 160, right: 60 },
              children: [
                new Paragraph({
                  keepNext: true,
                  spacing: { after: 0 },
                  children: [
                    ...(num ? [run(`${num} `, { bold: true, size: SZ_SECTION, color: secondary })] : []),
                    run(title, { bold: true, size: SZ_SECTION }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

  const blockToChildren = (b: Block): (Paragraph | Table)[] => {
    switch (b.kind) {
      case "section":
        return [spacer(120), sectionHeading(b.title, b.num), new Paragraph({ keepNext: true, spacing: { after: 0, line: 80, lineRule: "exact" }, children: [] })];
      case "subheading":
        return [new Paragraph({ keepNext: true, spacing: { after: 60 }, children: [run(b.text, { bold: true, size: 22 })] })];
      case "para":
        return [new Paragraph({ spacing: { after: 60, line: 276 }, children: runs(b.text) })];
      case "empty":
        return [new Paragraph({ spacing: { after: 60 }, children: [run(b.text, { color: "999999" })] })];
      case "roles":
        return b.items.map(
          (r) =>
            new Paragraph({
              spacing: { after: 60 },
              numbering: { reference: "bullet", level: 0, instance: 0 },
              children: [run(`${r.label} : ${r.value}`, { bold: true })],
            }),
        );
      case "legend":
        return [
          new Paragraph({
            spacing: { after: 80 },
            children: (Object.keys(STATUS_META) as PisteStatus[]).flatMap((st, i) => [
              ...(i ? [run("   ", { size: 17 })] : []),
              hl(` ${STATUS_META[st].symbol} ${STATUS_META[st].label} `, st, { size: 17, bold: true }),
            ]),
          }),
        ];
      case "list":
        if (b.asTable) return keywordTable(b.items, b.asTable);
        return b.items.flatMap((it) => {
          const st = it.status;
          const children: TextRun[] = [];
          // élément en gras quand il est suivi d'une définition / explication (prosit retour),
          // surligné en vert / orange / rouge selon son statut
          if (st) children.push(hl(`${STATUS_META[st].symbol} ${stripBold(it.text)}`, st, { bold: true }));
          else children.push(...runs(it.text, { bold: !!it.detail || !!it.blocks }));
          if (it.detail) {
            it.detail.split(/\r?\n/).forEach((line, i) => {
              if (i === 0) children.push(run(" : "), ...runs(line));
              else children.push(new TextRun({ text: "", break: 1 }), ...runs(line));
            });
          }
          const indent = LIST_LEFT + it.level * LIST_STEP;
          return [
            new Paragraph({
              spacing: { after: 60 },
              numbering: { reference: b.style, level: it.level, instance: b.instance },
              children,
            }),
            ...(it.blocks ?? []).flatMap((rb) => richBlock(rb, indent)),
          ];
        });
    }
  };

  // ---------- en-tête du document ----------
  const banner = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [3402, CONTENT_W - 3402],
    layout: TableLayoutType.FIXED,
    borders: TABLE_NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 3402, type: WidthType.DXA },
            borders: NO_BORDERS,
            shading: { type: ShadingType.CLEAR, color: "auto", fill: "000000" },
            margins: { top: 80, bottom: 80, left: 200, right: 200 },
            children: [new Paragraph({ spacing: { after: 0 }, children: [run(model.banner, { bold: true, size: SZ_BANNER, color: "FFFFFF" })] })],
          }),
          new TableCell({
            width: { size: CONTENT_W - 3402, type: WidthType.DXA },
            borders: NO_BORDERS,
            children: [new Paragraph({ spacing: { after: 0 }, children: [] })],
          }),
        ],
      }),
    ],
  });

  const titleBlock = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    layout: TableLayoutType.FIXED,
    borders: TABLE_NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_W, type: WidthType.DXA },
            borders: NO_BORDERS,
            shading: { type: ShadingType.CLEAR, color: "auto", fill: accent },
            margins: { top: 260, bottom: 260, left: 260, right: 260 },
            children: [new Paragraph({ spacing: { after: 0 }, children: [run(model.title, { bold: true, size: SZ_TITLE, color: readableOn(settings.accentColor) })] })],
          }),
        ],
      }),
    ],
  });

  const children: (Paragraph | Table)[] = [banner, titleBlock];
  if (model.info) children.push(new Paragraph({ spacing: { before: 80, after: 0 }, children: [run(model.info, { size: 17, color: "666666" })] }));
  for (const b of model.blocks) children.push(...blockToChildren(b));

  return new Document({
    creator: meta.auteur || "Prosit Builder",
    title: meta.nom || model.title,
    description: meta.theme,
    styles: {
      default: {
        document: { run: { font, size: SZ_BODY }, paragraph: { spacing: { after: 60, line: 276 } } },
      },
    },
    numbering: {
      config: Object.entries(numbering).map(([reference, levels]) => ({ reference, levels })),
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: 16838 },
            margin: { top: 1247, right: MARGIN_X, bottom: 1134, left: MARGIN_X, header: 720, footer: 720 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                spacing: { after: 0 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 18, space: 4, color: accent } },
                children: [run("CESI", { bold: true, size: 28 }), run("  _ÉCOLE D'INGÉNIEURS", { bold: true, size: 16 })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ children: ["PROSIT  _  ", PageNumber.CURRENT], font, bold: true, size: 16 })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

export async function buildDocx(opts: BuildOptions): Promise<Buffer> {
  return Packer.toBuffer(buildDocument(opts));
}
