import type { Content, DocType, ListItem, Meta, RichBlock } from "../schema";
import { STATUS_META, normalizeList } from "../schema";
import { coerceContent, getTemplate, sectionNumbers } from "../templates";
import { toRoman } from "../doc-model";

/**
 * Texte brut (façon Markdown) d'un prosit, donné en contexte à l'assistant IA.
 * Les rubriques vides restent listées (« (vide) ») pour que l'assistant sache ce qui manque.
 */
export function docToText(meta: Meta, type: DocType, rawContent: Content): string {
  const tpl = getTemplate(type);
  const content = coerceContent(tpl, rawContent);
  const nums = sectionNumbers(tpl);
  const out: string[] = [];

  out.push(`# ${tpl.label} — ${meta.nom || "Sans nom"}`);
  const info = [
    meta.theme && `Thème : ${meta.theme}`,
    meta.numero && `Prosit n° ${meta.numero}`,
  ].filter(Boolean);
  if (info.length) out.push(info.join(" · "));

  tpl.sections.forEach((section, si) => {
    const n = nums[si];
    out.push("", `## ${n ? `${toRoman(n)}. ` : ""}${section.title}`);

    const roles = section.fields.filter((f) => f.kind === "role");
    if (roles.length) {
      const filled = roles.map((f) => `${f.label} : ${String(content[f.key] ?? "").trim()}`).filter((l) => !l.endsWith(": "));
      out.push(...(filled.length ? filled : ["(vide)"]));
      return;
    }

    for (const f of section.fields) {
      const v = content[f.key];
      if (section.fields.length > 1) out.push(`### ${f.label}`);
      if (f.kind === "text") {
        const t = String(v ?? "").trim();
        out.push(t || "(vide)");
      } else if (f.kind === "list") {
        const items = normalizeList((v as ListItem[]).filter((i) => i.text.trim() !== ""));
        if (!items.length) out.push("(vide)");
        for (const it of items) out.push(...itemLines(it, f.detail));
      }
    }
  });

  return out.join("\n");
}

function itemLines(it: ListItem, detailLabel?: string): string[] {
  const pad = "  ".repeat(it.level);
  const status = it.status ? ` [${STATUS_META[it.status].label}]` : "";
  const lines = [`${pad}- ${it.text.trim()}${status}`];
  if (detailLabel && it.detail?.trim()) lines.push(`${pad}  ${detailLabel} : ${it.detail.trim()}`);
  for (const b of it.blocks ?? []) lines.push(...blockLines(b).map((l) => `${pad}  ${l}`));
  return lines;
}

function blockLines(b: RichBlock): string[] {
  if (b.type === "text") return b.text.trim() ? b.text.trim().split(/\r?\n/) : [];
  if (b.type === "images") return b.images.map((im) => `[image${im.caption ? ` : ${im.caption}` : ""}]`);
  return b.rows.map((r) => `| ${r.join(" | ")} |`);
}
