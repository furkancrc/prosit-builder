import { handle, jsonError } from "@/lib/api";
import { getDocument, getDocuments, getProsit, getSettings } from "@/lib/db";
import { effectiveRetourContent } from "@/lib/templates";
import { formatProsit } from "@/lib/format";
import { buildDocx } from "@/lib/docx/builder";
import { loadAssets } from "@/lib/assets";
import { collectAssetIds } from "@/lib/doc-model";
import { buildFilename, withExtension } from "@/lib/filename";
import { effectiveMeta } from "@/lib/meta";
import { docxToPdf, PdfUnavailableError } from "@/lib/pdf";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
} as const;

export function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const url = new URL(req.url);
    const format = url.searchParams.get("format") === "pdf" ? "pdf" : "docx";
    const doc = getDocument((await params).id);
    const prosit = doc && getProsit(doc.prositId);
    if (!doc || !prosit) return jsonError(404, "Document introuvable");

    const settings = getSettings();
    const meta = effectiveMeta(prosit, doc.type, doc.metaOverrides);
    // le retour est exporté fusionné avec l'aller (tout ce que l'aller contient et que le retour n'a pas)
    const aller = doc.type === "retour" ? getDocuments(doc.prositId).find((d) => d.type === "aller") : undefined;
    // mise en forme déterministe juste avant l'export (même modèle pour le Word et le PDF)
    const content = formatProsit(aller ? effectiveRetourContent(formatProsit(aller.content, "aller"), doc.content) : doc.content, doc.type);
    const assets = loadAssets(collectAssetIds(content));
    const docx = await buildDocx({ meta, type: doc.type, content, settings, assets });

    let body: Buffer = docx;
    if (format === "pdf") {
      try {
        body = await docxToPdf(docx);
      } catch (e) {
        if (e instanceof PdfUnavailableError) return jsonError(503, e.message);
        throw e;
      }
    }
    const requested = url.searchParams.get("filename")?.trim();
    const filename = withExtension(requested || buildFilename(settings.filenameTemplate, meta, doc.type), format);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": MIME[format],
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  });
}
