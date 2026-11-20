import { splitBold } from "@/lib/inline";
import type { ListItem, RichBlock } from "@/lib/schema";

/** Texte avec **gras** en ligne. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>))}
    </>
  );
}

/** Blocs riches (paragraphes, images, tableaux) — aperçu papier ou présentation sombre. */
export function BlocksView({ blocks, dark = false }: { blocks: RichBlock[]; dark?: boolean }) {
  return (
    <div className="mt-[3pt] space-y-[4pt]">
      {blocks.map((b) => {
        if (b.type === "text")
          return (
            <p key={b.id} className="whitespace-pre-wrap">
              <Inline text={b.text} />
            </p>
          );
        if (b.type === "images")
          return (
            <div key={b.id} className="grid items-end gap-[8pt]" style={{ gridTemplateColumns: `repeat(${Math.min(b.columns, b.images.length) || 1}, minmax(0, 1fr))` }}>
              {b.images.map((im, i) => (
                <figure key={i} className="text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${im.assetId}`} alt={im.caption || "Image"} className={`mx-auto max-h-[60vh] max-w-full object-contain ${dark ? "rounded-sm bg-white" : ""}`} />
                  {im.caption && <figcaption className={`mt-[2pt] text-[0.85em] italic ${dark ? "text-white/70" : ""}`}>{im.caption}</figcaption>}
                </figure>
              ))}
            </div>
          );
        const cols = Math.max(1, ...b.rows.map((r) => r.length));
        return (
          <table key={b.id} className={`w-full border-collapse text-[0.9em] ${dark ? "border-white/30" : ""}`}>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri}>
                  {Array.from({ length: cols }, (_, ci) => {
                    const head = b.header && ri === 0;
                    const Cell = head ? "th" : "td";
                    return (
                      <Cell
                        key={ci}
                        className={`border px-[4pt] py-[2pt] text-left align-top whitespace-pre-wrap ${dark ? "border-white/25" : "border-[#bfbfbf]"} ${head ? (dark ? "bg-white/10" : "bg-[#f2f2f2]") : "font-normal"}`}
                      >
                        <Inline text={r[ci] ?? ""} />
                      </Cell>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

/** Mots clés en tableau « Mot clé | Définition » (format CER du prosit retour). */
export function KeywordTable({ items, headers, accent, accentFg, dark = false }: { items: ListItem[]; headers: [string, string]; accent: string; accentFg: string; dark?: boolean }) {
  const border = dark ? "border-white/25" : "border-[#808080]";
  return (
    <>
      <table className="mb-[4pt] w-full border-collapse">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className={`border ${border} px-[4pt] py-[2pt] text-left`} style={{ background: accent, color: accentFg }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td className={`w-[34%] border ${border} px-[4pt] py-[2pt] align-top font-bold`}>
                <Inline text={it.text} />
              </td>
              <td className={`border ${border} px-[4pt] py-[2pt] align-top whitespace-pre-wrap`}>
                <Inline text={it.detail ?? ""} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items
        .filter((it) => it.blocks?.length)
        .map((it) => (
          <div key={it.id} className="mb-[4pt]">
            <p className="font-bold">
              <Inline text={it.text} />
            </p>
            <BlocksView blocks={it.blocks!} dark={dark} />
          </div>
        ))}
    </>
  );
}
