import { describe, expect, it } from "vitest";
import { fitSize, imageInfo } from "@/lib/image-info";
import { splitBold, stripBold } from "@/lib/inline";
import { cleanBlocks, collectAssetIds } from "@/lib/doc-model";

describe("imageInfo", () => {
  it("lit les dimensions d'un PNG", () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    expect(imageInfo(png)).toEqual({ type: "png", mime: "image/png", width: 1, height: 1 });
  });
  it("lit les dimensions d'un GIF", () => {
    const gif = Buffer.from("R0lGODlhAgADAIAAAP///wAAACwAAAAAAgADAAACAoRRADs=", "base64");
    expect(imageInfo(gif)).toMatchObject({ type: "gif", width: 2, height: 3 });
  });
  it("lit les dimensions d'un JPEG (segment SOF0)", () => {
    // en-tête JPEG minimal : SOI, APP0 vide, SOF0 320×200
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x40, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(imageInfo(jpg)).toMatchObject({ type: "jpg", width: 320, height: 200 });
  });
  it("refuse les autres formats", () => {
    expect(imageInfo(Buffer.from("<svg></svg>"))).toBeNull();
  });
  it("réduit en gardant le ratio", () => {
    expect(fitSize(2000, 1000, 600)).toEqual({ width: 600, height: 300 });
    expect(fitSize(100, 50, 600)).toEqual({ width: 100, height: 50 });
  });
});

describe("gras en ligne", () => {
  it("découpe **gras**", () => {
    expect(splitBold("Un **S.I.** est **organisé**.")).toEqual([
      { text: "Un ", bold: false },
      { text: "S.I.", bold: true },
      { text: " est ", bold: false },
      { text: "organisé", bold: true },
      { text: ".", bold: false },
    ]);
    expect(stripBold("**a** b")).toBe("a b");
    expect(splitBold("pas de gras")).toEqual([{ text: "pas de gras", bold: false }]);
  });
});

describe("blocs riches", () => {
  it("retire les blocs vides et collecte les images", () => {
    const blocks = cleanBlocks([
      { id: "1", type: "text", text: "  " },
      { id: "2", type: "images", columns: 2, images: [] },
      { id: "3", type: "table", header: true, rows: [["", ""]] },
      { id: "4", type: "images", columns: 1, images: [{ assetId: "x", caption: "" }] },
    ]);
    expect(blocks?.map((b) => b.id)).toEqual(["4"]);
    expect(collectAssetIds({ etude: [{ id: "a", text: "t", level: 0, blocks }] })).toEqual(["x"]);
  });
});
