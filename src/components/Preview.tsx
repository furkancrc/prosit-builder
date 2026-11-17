"use client";

import { buildDocModel, listMarker, numberItems, toRoman } from "@/lib/doc-model";
import { tintHex } from "@/lib/color";
import type { Content, DocType, Meta, Settings } from "@/lib/schema";

const FONT_STACK: Record<Settings["docFont"], string> = {
  Arial: "Arial, 'Liberation Sans', Helvetica, sans-serif",
  Calibri: "Calibri, Carlito, 'Segoe UI', sans-serif",
  "Times New Roman": "'Times New Roman', 'Liberation Serif', Times, serif",
  Cambria: "Cambria, Caladea, Georgia, serif",
  "Courier New": "'Courier New', 'Liberation Mono', monospace",
};

/** Aperçu HTML fidèle à l'export : mêmes blocs, tailles en pt, police et couleurs des réglages. */
export function Preview({ meta, type, content, settings }: { meta: Meta; type: DocType; content: Content; settings: Settings }) {
  const model = buildDocModel(meta, type, content);
  const h1 = settings.docHeadingColor;
  const h2 = tintHex(settings.docHeadingColor, 0.4);

  return (
    <div className="paper mx-auto w-full max-w-[210mm] px-[8%] py-[7%] text-[11pt] leading-[1.35]" style={{ fontFamily: FONT_STACK[settings.docFont] }}>
      {model.header && <p className="-mt-6 mb-6 text-right text-[8pt] text-[#808080]">{model.header}</p>}
      <h1 className="pb-1 text-center text-[clamp(20pt,5vw,36pt)] leading-tight" style={{ color: h1, borderBottom: `2px solid ${settings.accentColor}` }}>
        {model.title}
      </h1>
      {model.info.length > 0 && (
        <table className="mt-4 text-[10pt]">
          <tbody>
            {model.info.map((i) => (
              <tr key={i.label}>
                <th className="pr-4 text-left align-top font-bold">{i.label} :</th>
                <td>{i.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {model.blocks.map((b, k) => {
        switch (b.kind) {
          case "h1":
            return (
              <h2 key={k} className="mt-[12pt] mb-[6pt] flex gap-3 text-[16pt] sm:text-[20pt]" style={{ color: h1 }}>
                <span className="w-[0.55in] shrink-0">{toRoman(b.index)}.</span>
                <span>{b.text}</span>
              </h2>
            );
          case "h2":
            return (
              <h3 key={k} className="mt-[4pt] mb-[3pt] ml-[0.5in] flex gap-2 text-[13pt] sm:text-[16pt]" style={{ color: h2 }}>
                <span>{b.index})</span>
                <span>{b.text}</span>
              </h3>
            );
          case "para":
            return <p key={k} className="mb-[8pt] whitespace-pre-wrap">{b.text}</p>;
          case "empty":
            return <p key={k} className="mb-[8pt] text-[#999]">{b.text}</p>;
          case "list": {
            const nums = numberItems(b.items);
            return (
              <ul key={k} className="mb-[8pt]">
                {b.items.map((it, i) => (
                  <li key={it.id} className="flex" style={{ paddingLeft: `${0.25 + it.level * 0.5}in` }}>
                    <span className="w-[0.25in] shrink-0">{listMarker(b.style, it.level, nums[i])}</span>
                    <span className="min-w-0 break-words">{it.text}</span>
                  </li>
                ))}
              </ul>
            );
          }
        }
      })}
    </div>
  );
}
