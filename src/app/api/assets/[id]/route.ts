import { jsonError } from "@/lib/api";
import { getAsset } from "@/lib/assets";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const asset = getAsset((await params).id);
  if (!asset) return jsonError(404, "Image introuvable");
  return new Response(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mime,
      // les images ne changent jamais (identifiant unique) : cache long côté navigateur
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
