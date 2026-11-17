import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ILevelsOptions,
} from "docx";
import type { Content, DocType, Meta, Settings } from "../schema";
import { buildDocModel, type Block } from "../doc-model";
import type { ListStyle } from "../templates";

const hex = (c: string) => c.replace("#", "").toUpperCase();

/** Éclaircit une couleur (t = 0..1 vers le blanc). #4472C4 à 40 % ≈ #8EAADB (Titre 2 du template). */
export function tint(color: string, t: number): string {
  const n = parseInt(hex(color), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t));
  return ch.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const INDENT = 720; // 1,27 cm comme le « Paragraphe de liste » du template
const HANG = 360;

function lvl(level: number, format: (typeof LevelFormat)[keyof typeof LevelFormat], text: string): ILevelsOptions {
  return {
    level,
    format,
    text,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: INDENT * (level + 1), hanging: HANG } } },
  };
}

const NUMBERING: Record<ListStyle | "h1" | "h2", ILevelsOptions[]> = {
  h1: [{ level: 0, format: LevelFormat.UPPER_ROMAN, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 794, hanging: 794 } } } }],
  h2: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1)", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
  bullet: [lvl(0, LevelFormat.BULLET, "-"), lvl(1, LevelFormat.BULLET, "o"), lvl(2, LevelFormat.BULLET, "▪")],
  numbered: [lvl(0, LevelFormat.DECIMAL, "%1."), lvl(1, LevelFormat.LOWER_LETTER, "%2."), lvl(2, LevelFormat.LOWER_ROMAN, "%3.")],
  "bullet-numbered": [lvl(0, LevelFormat.BULLET, "-"), lvl(1, LevelFormat.DECIMAL, "%2."), lvl(2, LevelFormat.LOWER_LETTER, "%3.")],
};

export interface BuildOptions {
  meta: Meta;
  type: DocType;
  content: Content;
  settings: Pick<Settings, "docFont" | "docHeadingColor" | "accentColor">;
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;

function infoTable(info: { label: string; value: string }[], font: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [2000, 7000],
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    rows: info.map(
      (i) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 2000, type: WidthType.DXA },
              children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: `${i.label} :`, bold: true, font, size: 20 })] })],
            }),
            new TableCell({
              width: { size: 7000, type: WidthType.DXA },
              children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: i.value, font, size: 20 })] })],
            }),
          ],
        }),
    ),
  });
}

function blockToParagraphs(b: Block, h2Instance: (section: number) => number): Paragraph[] {
  switch (b.kind) {
    case "h1":
      return [new Paragraph({ heading: HeadingLevel.HEADING_1, numbering: { reference: "h1", level: 0 }, text: b.text })];
    case "h2":
      return [new Paragraph({ heading: HeadingLevel.HEADING_2, numbering: { reference: "h2", level: 0, instance: h2Instance(b.section) }, text: b.text })];
    case "para":
      return [new Paragraph({ text: b.text })];
    case "empty":
      return [new Paragraph({ children: [new TextRun({ text: b.text, color: "999999" })] })];
    case "list":
      return b.items.map(
        (it) =>
          new Paragraph({
            style: "ListParagraph",
            numbering: { reference: b.style, level: it.level, instance: b.instance },
            text: it.text,
          }),
      );
  }
}

export function buildDocument({ meta, type, content, settings }: BuildOptions): Document {
  const model = buildDocModel(meta, type, content);
  const font = settings.docFont;
  const h1Color = hex(settings.docHeadingColor);
  const h2Color = tint(settings.docHeadingColor, 0.4);

  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, text: model.title }),
  ];
  if (model.info.length) {
    children.push(new Paragraph({ spacing: { after: 0 }, text: "" }));
    children.push(infoTable(model.info, font));
  }
  const h2Instances = new Map<number, number>();
  const h2Instance = (s: number) => {
    if (!h2Instances.has(s)) h2Instances.set(s, h2Instances.size + 1);
    return h2Instances.get(s)!;
  };
  for (const b of model.blocks) children.push(...blockToParagraphs(b, h2Instance));

  return new Document({
    creator: meta.auteur || "Prosit Builder",
    title: meta.nom || model.title,
    description: meta.theme,
    styles: {
      default: {
        document: { run: { font, size: 22 }, paragraph: { spacing: { after: 160, line: 259 } } },
      },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font, size: 72, color: h1Color },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, line: 240 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, space: 4, color: hex(settings.accentColor) } },
          },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font, size: 40, color: h1Color },
          paragraph: { keepNext: true, keepLines: true, spacing: { before: 240, after: 120 } },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font, size: 32, color: h2Color },
          paragraph: { keepNext: true, keepLines: true, spacing: { before: 40, after: 60 } },
        },
        {
          id: "ListParagraph",
          name: "List Paragraph",
          basedOn: "Normal",
          quickFormat: true,
          paragraph: { contextualSpacing: true, spacing: { line: 256 }, indent: { left: INDENT } },
        },
      ],
    },
    numbering: {
      config: Object.entries(NUMBERING).map(([reference, levels]) => ({ reference, levels })),
    },
    sections: [
      {
        properties: { page: { margin: { top: 1417, bottom: 1417, left: 1417, right: 1417 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: model.header, size: 16, color: "808080", font })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ children: ["Page ", PageNumber.CURRENT, " sur ", PageNumber.TOTAL_PAGES], size: 18, font }),
                ],
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
