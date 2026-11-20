import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { imageInfo, type ImageInfo } from "./image-info";

export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

function assetsDir(): string {
  const dir = path.join(path.resolve(process.env.DATA_DIR || "./data"), "assets");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export interface StoredAsset extends ImageInfo {
  id: string;
  data: Buffer;
}

export class InvalidAssetError extends Error {}

/** Enregistre une image (PNG, JPEG ou GIF) et renvoie son identifiant. */
export function saveAsset(data: Buffer): { id: string; info: ImageInfo } {
  if (data.length > MAX_ASSET_BYTES) throw new InvalidAssetError("Image trop volumineuse (10 Mo max)");
  const info = imageInfo(data);
  if (!info) throw new InvalidAssetError("Format non pris en charge : utilise une image PNG, JPEG ou GIF");
  const id = randomUUID();
  fs.writeFileSync(path.join(assetsDir(), `${id}.${info.type}`), data);
  db()
    .prepare("INSERT INTO assets (id, mime, width, height, size, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, info.mime, info.width, info.height, data.length, new Date().toISOString());
  return { id, info };
}

export function getAsset(id: string): StoredAsset | undefined {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const row = db().prepare("SELECT id, mime, width, height FROM assets WHERE id = ?").get(id) as
    | { id: string; mime: string; width: number; height: number }
    | undefined;
  if (!row) return undefined;
  const type = row.mime === "image/png" ? "png" : row.mime === "image/gif" ? "gif" : "jpg";
  const file = path.join(assetsDir(), `${id}.${type}`);
  if (!fs.existsSync(file)) return undefined;
  return { id, type, mime: row.mime, width: row.width, height: row.height, data: fs.readFileSync(file) };
}

/** Charge les images d'un contenu (les identifiants introuvables sont ignorés). */
export function loadAssets(ids: string[]): Map<string, StoredAsset> {
  const out = new Map<string, StoredAsset>();
  for (const id of ids) {
    const a = getAsset(id);
    if (a) out.set(id, a);
  }
  return out;
}
