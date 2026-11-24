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
  const style = settings.docStyle ?? "cesi";
  const classic = style === "classique";
  const rapport = style === "rapport";
  const plain = style !== "cesi";
  const ORANGE = "#D0583A";
  const model = buildDocModel(meta, type, content, style);
  const accent = settings.accentColor;
  // classique : puces et numéros noirs, titres bleus du thème Word
  const pink = plain ? "#000000" : settings.docSecondaryColor;
  const BLUE = "#4472C4";
  const LIGHT = "#8EAADB";
  /** Puces du style classique : « - », « o », « ▪ » (au lieu des ■ CESI). */
  const mk = (m: string, level: number) => (plain && m === "■" ? (classic ? ["-", "o", "▪"] : ["•", "o", "▪"])[level] ?? "-" : m);
  const headFont = classic && settings.docFont === "Calibri" ? "'Calibri Light', Carlito, 'Segoe UI Light', sans-serif" : undefined;

  return (
    <div
      className="paper mx-auto w-full max-w-[210mm] px-[7%] pt-[5%] pb-[7%] text-[10.5pt] leading-[1.35]"
      style={{ fontFamily: FONT_STACK[settings.docFont] }}
      data-style={style}
    >
      {rapport ? (
        <>
          <p className="mb-[12pt] text-[16pt] font-bold italic">{model.pbl}</p>
          <h1 className="mb-[4pt] text-[clamp(18pt,4vw,24pt)] font-bold underline">{model.heading}</h1>
          {model.info && <p className="mb-[6pt] text-[8.5pt] text-[#666]">{model.info}</p>}
        </>
      ) : classic ? (
        <>
          <h1 className="pb-[2pt] text-center text-[clamp(22pt,5vw,36pt)] leading-tight" style={{ color: BLUE, borderBottom: `1px solid ${BLUE}`, fontFamily: headFont }}>
            {model.heading}
          </h1>
          {model.info && <p className="mt-[4pt] mb-[6pt] text-center text-[8.5pt] text-[#666]">{model.info}</p>}
        </>
      ) : (
        <>
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
        </>
      )}

      {model.blocks.map((b, k) => {
        switch (b.kind) {
          case "section":
            if (rapport)
              return (
                <h2 key={k} data-preview-nav={b.nav} className="mt-[12pt] mb-[6pt] text-[14pt] font-bold sm:text-[16pt]" style={{ color: ORANGE }}>
                  {b.label}.
                </h2>
              );
            if (classic)
              return (
                <h2 key={k} data-preview-nav={b.nav} className="mt-[12pt] mb-[6pt] flex text-[16pt] sm:text-[20pt]" style={{ color: BLUE, fontFamily: headFont }}>
                  <span className="w-[0.55in] shrink-0">{b.num}.</span>
                  <span>{b.label}</span>
                </h2>
              );
            return (
              <div key={k} data-preview-nav={b.nav} className="mt-[12pt] mb-[4pt] flex items-stretch">
                <span className="w-[17pt] shrink-0" style={{ background: accent }} />
                <h2 className="flex-1 border-b border-black py-[3pt] pl-[8pt] text-[13pt] font-bold sm:text-[15pt]">
                  {b.num && <span style={{ color: pink }}>{b.num} </span>}
                  {b.title}
                </h2>
              </div>
            );
          case "h2":
            if (rapport)
              return (
                <h3 key={k} data-preview-nav={b.nav} className="mt-[8pt] mb-[4pt] text-[14pt] font-bold underline sm:text-[16pt]">
                  {b.text}
                </h3>
              );
            return (
              <h3 key={k} data-preview-nav={b.nav} className="mt-[4pt] mb-[3pt] ml-[0.3in] flex gap-[8pt] text-[13pt] sm:text-[16pt]" style={{ color: LIGHT, fontFamily: headFont }}>
                <span>{b.num})</span>
                <span>{b.text}</span>
              </h3>
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
                  <Item key={r.label} marker={mk("■", 0)} pink={pink} level={0} bold classic={plain}>
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
              return <KeywordTable key={k} items={b.items} headers={b.asTable} accent={classic ? BLUE : rapport ? ORANGE : accent} accentFg={plain ? "#ffffff" : readableOn(accent)} />;
            const nums = numberItems(b.items);
            if (b.plan)
              // élément structuré du plan d'action : même rendu que le Word (titre, description, points, étapes, intérêt)
              return (
                <ul key={k}>
                  {b.items.map((it, i) => {
                    const more = !!(it.description || it.points?.length || it.etapes?.length || it.interet || it.detail || it.blocks?.length);
                    return (
                      <Item key={it.id} marker={mk(listMarker(b.style, 0, nums[i]), 0)} pink={pink} level={0} classic={plain}>
                        <span className={more ? "font-bold" : ""}>
                          <Inline text={it.text} />
                        </span>
                        {it.description && (
                          <p className="mt-[2pt]">
                            <Inline text={it.description} />
                          </p>
                        )}
                        {!!it.points?.length && (
                          <ul className="mt-[2pt]">
                            {it.points.map((p, j) => (
                              <li key={j} className="flex">
                                <span className="w-[14pt] shrink-0" style={{ color: pink }}>
                                  {plain ? "o" : "■"}
                                </span>
                                <span>
                                  {p.label && <strong>{p.label} : </strong>}
                                  <Inline text={p.texte} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {!!it.etapes?.length && (
                          <ol className="mt-[2pt] ml-[18pt] list-decimal">
                            {it.etapes.map((e, j) => (
                              <li key={j}>
                                <Inline text={e} />
                              </li>
                            ))}
                          </ol>
                        )}
                        {it.interet && (
                          <p className="mt-[2pt] ml-[18pt]">
                            <strong>Intérêt :</strong> <Inline text={it.interet} />
                          </p>
                        )}
                        {it.detail && <p className="mt-[2pt] whitespace-pre-wrap">{it.detail}</p>}
                        {it.blocks && <BlocksView blocks={it.blocks} />}
                      </Item>
                    );
                  })}
                </ul>
              );
            return (
              <ul key={k}>
                {b.items.map((it, i) => {
                  const st = it.status ? STATUS_META[it.status] : undefined;
                  const lines = (it.detail ?? "").split(/\r?\n/).filter((l) => l.trim());
                  // « terme : définition » en ligne seulement pour un terme court ; justification d'hypothèse en dessous
                  const inline = !st && lines.length > 0 && it.text.trim().split(/\s+/).length <= 6;
                  const below = inline ? lines.slice(1) : lines;
                  return (
                    <Item key={it.id} marker={mk(listMarker(b.style, it.level, nums[i]), it.level)} pink={pink} level={it.level} classic={plain}>
                      <span style={st ? { background: st.highlight } : undefined} className={st || inline || (it.blocks && !lines.length) ? "font-bold" : ""}>
                        {st && `${st.symbol} `}
                        <Inline text={it.text} />
                      </span>
                      {inline && (
                        <span>
                          {" : "}
                          <Inline text={lines[0]} />
                        </span>
                      )}
                      {below.map((l, j) => (
                        <p key={j} className="mt-[2pt]">
                          <Inline text={l} />
                        </p>
                      ))}
                      {it.blocks && <BlocksView blocks={it.blocks} />}
                    </Item>
                  );
                })}
              </ul>
            );
          }
        }
      })}
      {rapport ? null : classic ? (
        <p className="mt-8 text-right text-[9pt]" style={{ color: BLUE }}>
          Page <strong>1</strong> sur <strong>1</strong>
        </p>
      ) : (
        <p className="mt-8 text-right text-[8pt] font-bold">PROSIT&nbsp;&nbsp;_&nbsp;&nbsp;1</p>
      )}
    </div>
  );
}

function Item({ marker, pink, level, bold, classic, children }: { marker: string; pink: string; level: number; bold?: boolean; classic?: boolean; children: React.ReactNode }) {
  const isSquare = marker === "■";
  // classique : retrait Word (puce à 0,25 po, texte à 0,5 po + 0,5 po par niveau)
  const pad = classic ? (360 + level * 720) / 20 : (510 - 283 + level * 397) / 20;
  return (
    <li className={`mb-[3pt] flex ${bold ? "font-bold" : ""}`} style={{ paddingLeft: `${pad}pt` }}>
      <span className={`shrink-0 ${classic ? "w-[18pt] font-normal" : "pr-[4pt] font-bold"} ${isSquare ? "text-[7pt] leading-[2]" : ""}`} style={{ color: pink }}>
        {marker}
      </span>
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </li>
  );
}
