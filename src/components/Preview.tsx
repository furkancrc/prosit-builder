"use client";

import { buildDocModel, listMarker, numberItems } from "@/lib/doc-model";
import { readableOn } from "@/lib/color";
import { STATUS_META, type Content, type DocType, type Meta, type PisteStatus, type Settings } from "@/lib/schema";
import { BlocksView, Inline, KeywordTable } from "./RichView";

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
  const accent = settings.accentColor;
  const pink = settings.docSecondaryColor;
  // Le n-ième bloc « section » correspond à la n-ième rubrique du gabarit, soit l'entrée n+1 de la navigation (0 = en-tête).
  let sectionIdx = 0;

  return (
    <div className="paper mx-auto w-full max-w-[210mm] px-[7%] pt-[5%] pb-[7%] text-[10.5pt] leading-[1.35]" style={{ fontFamily: FONT_STACK[settings.docFont] }}>
      {/* En-tête de page */}
      <p className="mb-5 pb-1 font-bold leading-none" style={{ borderBottom: `3px solid ${accent}` }}>
        <span className="text-[14pt]">CESI</span>
        <span className="text-[8pt]">&nbsp;&nbsp;_ÉCOLE D&apos;INGÉNIEURS</span>
      </p>

      <div className="inline-block w-[35%] min-w-fit bg-black px-[10pt] py-[4pt] text-[11pt] font-bold text-white">{model.banner}</div>
      <div className="px-[13pt] py-[13pt] text-[clamp(14pt,3.5vw,20pt)] font-bold leading-tight" style={{ background: accent, color: readableOn(accent) }}>
        {model.title}
      </div>
      {model.info && <p className="mt-[4pt] text-[8.5pt] text-[#666]">{model.info}</p>}

      {model.blocks.map((b, k) => {
        switch (b.kind) {
          case "section":
            return (
              <div key={k} data-preview-nav={++sectionIdx} className="mt-[12pt] mb-[4pt] flex items-stretch">
                <span className="w-[17pt] shrink-0" style={{ background: accent }} />
                <h2 className="flex-1 border-b border-black py-[3pt] pl-[8pt] text-[13pt] font-bold sm:text-[15pt]">
                  {b.num && <span style={{ color: pink }}>{b.num} </span>}
                  {b.title}
                </h2>
              </div>
            );
          case "subheading":
            return <p key={k} className="mb-[3pt] text-[11pt] font-bold">{b.text}</p>;
          case "para":
            return (
              <p key={k} className="mb-[3pt] whitespace-pre-wrap">
                <Inline text={b.text} />
              </p>
            );
          case "empty":
            return <p key={k} className="mb-[3pt] text-[#999]">{b.text}</p>;
          case "roles":
            return (
              <ul key={k}>
                {b.items.map((r) => (
                  <Item key={r.label} marker="■" pink={pink} level={0} bold>
                    {r.label} : {r.value}
                  </Item>
                ))}
              </ul>
            );
          case "legend":
            return (
              <p key={k} className="mb-[4pt] flex flex-wrap gap-x-[10pt] text-[8.5pt] font-bold">
                {(Object.keys(STATUS_META) as PisteStatus[]).map((st) => (
                  <span key={st} className="px-[2pt]" style={{ background: STATUS_META[st].highlight }}>
                    {STATUS_META[st].symbol} {STATUS_META[st].label}
                  </span>
                ))}
              </p>
            );
          case "list": {
            if (b.asTable)
              return <KeywordTable key={k} items={b.items} headers={b.asTable} accent={accent} accentFg={readableOn(accent)} />;
            const nums = numberItems(b.items);
            return (
              <ul key={k}>
                {b.items.map((it, i) => {
                  const st = it.status ? STATUS_META[it.status] : undefined;
                  return (
                    <Item key={it.id} marker={listMarker(b.style, it.level, nums[i])} pink={pink} level={it.level}>
                      <span style={st ? { background: st.highlight } : undefined} className={it.detail || it.blocks || st ? "font-bold" : ""}>
                        {st && `${st.symbol} `}
                        <Inline text={it.text} />
                      </span>
                      {it.detail && (
                        <span className="whitespace-pre-wrap">
                          {" : "}
                          <Inline text={it.detail} />
                        </span>
                      )}
                      {it.blocks && <BlocksView blocks={it.blocks} />}
                    </Item>
                  );
                })}
              </ul>
            );
          }
        }
      })}
      <p className="mt-8 text-right text-[8pt] font-bold">PROSIT&nbsp;&nbsp;_&nbsp;&nbsp;1</p>
    </div>
  );
}

function Item({ marker, pink, level, bold, children }: { marker: string; pink: string; level: number; bold?: boolean; children: React.ReactNode }) {
  const isSquare = marker === "■";
  return (
    <li className={`mb-[3pt] flex ${bold ? "font-bold" : ""}`} style={{ paddingLeft: `${(510 - 283 + level * 397) / 20}pt` }}>
      <span className={`shrink-0 pr-[4pt] font-bold ${isSquare ? "text-[7pt] leading-[2]" : ""}`} style={{ color: pink }}>
        {marker}
      </span>
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </li>
  );
}
