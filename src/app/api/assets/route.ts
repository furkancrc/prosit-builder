import { NextResponse } from "next/server";
import { handle, jsonError } from "@/lib/api";
import { isAuthorized } from "@/lib/session";
import { InvalidAssetError, MAX_ASSET_BYTES, saveAsset } from "@/lib/assets";

/** Envoi d'une image (schéma, capture…) pour les blocs riches du prosit retour. */
export function POST(req: Request) {
  return handle(async () => {
    if (!(await isAuthorized(req))) return jsonError(401, "Non authentifié");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(400, "Aucune image reçue");
    if (file.size > MAX_ASSET_BYTES) return jsonError(413, "Image trop volumineuse (10 Mo max)");
    try {
      const { id, info } = saveAsset(Buffer.from(await file.arrayBuffer()));
      return NextResponse.json({ id, width: info.width, height: info.height }, { status: 201 });
    } catch (e) {
      if (e instanceof InvalidAssetError) return jsonError(415, e.message);
      throw e;
    }
  });
}
