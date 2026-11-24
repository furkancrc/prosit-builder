import "server-only";
import { getDocuments, getProsit } from "../db";
import { effectiveMeta } from "../meta";
import type { DocType, Meta } from "../schema";
import { docToText } from "./doc-text";
import { fetchLink } from "./links";
import { buildContext } from "./prompt";

const META_KEYS: (keyof Meta)[] = ["nom", "theme", "numero", "bloc", "date", "auteur", "groupe", "lien"];

/** Relit le prosit enregistré (aller + retour) et ses liens d'aide, et construit le contexte donné à l'assistant. */
export async function prositContext(prositId: string, type: DocType, focus?: string) {
  const prosit = getProsit(prositId);
  if (!prosit) return null;
  const docs = getDocuments(prosit.id);
  const base = Object.fromEntries(META_KEYS.map((k) => [k, prosit[k] ?? ""])) as Meta;
  const textOf = (t: DocType) => {
    const d = docs.find((x) => x.type === t);
    return d ? docToText(effectiveMeta(base, t, t === "retour" ? d.metaOverrides : null), t, d.content) : "";
  };
  const links = await Promise.all(prosit.liensAide.map(fetchLink));
  const context = buildContext({ type, docText: textOf(type), allerText: type === "retour" ? textOf("aller") : undefined, focus, links });
  return { context, links };
}
