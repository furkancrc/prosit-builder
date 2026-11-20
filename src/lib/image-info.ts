/** Format et dimensions d'une image PNG, JPEG ou GIF, lus dans l'en-tête (sans dépendance native). */
export interface ImageInfo {
  type: "png" | "jpg" | "gif";
  mime: string;
  width: number;
  height: number;
}

export function imageInfo(buf: Uint8Array): ImageInfo | null {
  const b = buf;
  const u16be = (o: number) => (b[o] << 8) | b[o + 1];
  const u32be = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

  // PNG : signature + chunk IHDR
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { type: "png", mime: "image/png", width: u32be(16), height: u32be(20) };
  }
  // GIF : « GIF8 » + largeur/hauteur little-endian
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return { type: "gif", mime: "image/gif", width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
  }
  // JPEG : parcours des segments jusqu'à un SOFn
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) {
        o++;
        continue;
      }
      const marker = b[o + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        o += 2;
        continue;
      }
      const len = u16be(o + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { type: "jpg", mime: "image/jpeg", height: u16be(o + 5), width: u16be(o + 7) };
      o += 2 + len;
    }
  }
  return null;
}

/** Taille d'affichage (px à 96 dpi) qui tient dans une largeur maximale, ratio conservé. */
export function fitSize(w: number, h: number, maxW: number, maxH = maxW * 1.4): { width: number; height: number } {
  if (!w || !h) return { width: maxW, height: Math.round(maxW * 0.6) };
  const k = Math.min(1, maxW / w, maxH / h);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}
