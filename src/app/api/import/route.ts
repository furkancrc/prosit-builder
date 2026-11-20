import { NextResponse } from "next/server";
import { handle, jsonError } from "@/lib/api";
import { importDocx } from "@/lib/docx/import";
import { saveAsset } from "@/lib/assets";
import { DocTypeSchema } from "@/lib/schema";
import { isAuthorized } from "@/lib/session";

const MAX = 10 * 1024 * 1024;

export function POST(req: Request) {
  return handle(async () => {
    if (!(await isAuthorized(req))) return jsonError(401, "Non authentifié");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(400, "Aucun fichier reçu");
    if (file.size > MAX) return jsonError(413, "Fichier trop volumineux (10 Mo max)");
    const type = DocTypeSchema.optional().parse(form.get("type") || undefined);
    try {
      // les images du document (schémas, captures) sont enregistrées pour les blocs riches du retour
      const saveImage = (data: Buffer) => {
        try {
          return saveAsset(data).id;
        } catch {
          return null; // format non pris en charge (EMF, SVG…) : ignorée
        }
      };
      return NextResponse.json(await importDocx(await file.arrayBuffer(), type, saveImage));
    } catch {
      return jsonError(400, "Impossible de lire ce fichier : est-ce bien un .docx ?");
    }
  });
}
