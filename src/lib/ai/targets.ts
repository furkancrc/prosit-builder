import type { DocType } from "../schema";
import { extractFence, stripCitations } from "./insert";

/** Blocs de réponse appliqués directement à un élément ou à un champ ciblé. */
export const TEXT_FENCE = "prosit-texte";
export const DETAIL_FENCE = "prosit-detail";

export type AssistAction = "fix" | "improve" | "write";

/** Ce que vise un bouton assistant : un élément de liste, ou un champ texte (Contexte, Problématique…). */
export type AssistTarget =
  | { kind: "item"; tab: DocType; section: string; fieldKey: string; fieldLabel: string; itemId: string; text: string; detail?: string; detailLabel?: string }
  | { kind: "field"; tab: DocType; section: string; fieldKey: string; fieldLabel: string; text: string };

export const ACTION_LABELS: Record<AssistAction, string> = {
  fix: "Corriger les fautes",
  improve: "Améliorer la rédaction",
  write: "Rédiger",
};

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Libellé affiché dans le menu pour l'action « Rédiger ». */
export function writeLabel(t: AssistTarget): string {
  return t.kind === "item" ? `Rédiger « ${t.detailLabel ?? "l’explication"} »` : `Rédiger « ${t.fieldLabel} »`;
}

/** Demande envoyée à l'assistant, et libellé court affiché dans la discussion. */
export function buildTargetPrompt(t: AssistTarget, action: AssistAction): { prompt: string; label: string } {
  const where = `rubrique « ${t.section} »${t.fieldLabel !== t.section ? `, partie « ${t.fieldLabel} »` : ""}, prosit ${t.tab}`;
  const keepStyle = "Garde le sens, le niveau de langue et le style de l'étudiant.";

  if (t.kind === "field") {
    const label = `${action === "write" ? writeLabel(t) : ACTION_LABELS[action]} · ${t.fieldLabel}`;
    if (action === "write")
      return {
        label,
        prompt: `Rédige le texte de la ${where}, cohérent avec le reste du prosit${t.text.trim() ? ` et en partant de ce qui est déjà écrit : « ${t.text} »` : ""}. Donne uniquement le texte final dans un bloc \`\`\`${TEXT_FENCE}\`\`\` (sans citations [n]), puis une phrase d'explication au plus.`,
      };
    const task = action === "fix" ? `Corrige uniquement les fautes (orthographe, grammaire, accords, ponctuation). ${keepStyle}` : `Améliore la rédaction : clarté, concision, termes techniques précis. ${keepStyle}`;
    return {
      label,
      prompt: `${task}\nTexte de la ${where} :\n« ${t.text} »\nDonne le texte complet corrigé dans un bloc \`\`\`${TEXT_FENCE}\`\`\` (sans citations [n]), puis la liste courte des changements (ou dis qu'il n'y en a pas).`,
    };
  }

  const item = `l'élément « ${t.text} » (${where})`;
  if (action === "write") {
    const dl = t.detailLabel ?? "explication";
    return {
      label: `${writeLabel(t)} · ${short(t.text)}`,
      prompt: `Rédige le champ « ${dl} » de ${item} : 2 à 4 phrases précises, adaptées à un étudiant ingénieur, appuyées sur les ressources d'aide et le reste du prosit${t.detail?.trim() ? `, en complétant ce qui est déjà écrit : « ${t.detail} »` : ""}. Donne uniquement ce texte dans un bloc \`\`\`${DETAIL_FENCE}\`\`\` (sans citations [n]), puis cite tes sources en dehors du bloc.`,
    };
  }
  const task = action === "fix" ? `Corrige uniquement les fautes (orthographe, grammaire, accords, ponctuation) de ${item}. ${keepStyle}` : `Améliore la rédaction de ${item} : plus clair, plus précis, formulation adaptée à un prosit. ${keepStyle}`;
  const withDetail = !!(t.detailLabel && t.detail?.trim());
  return {
    label: `${ACTION_LABELS[action]} · ${short(t.text)}`,
    prompt: `${task}${withDetail ? `\nSon champ « ${t.detailLabel} » : « ${t.detail} »` : ""}\nDonne le texte corrigé de l'élément (une seule ligne) dans un bloc \`\`\`${TEXT_FENCE}\`\`\`${
      withDetail ? ` et le champ « ${t.detailLabel} » corrigé dans un bloc \`\`\`${DETAIL_FENCE}\`\`\`` : ""
    } (sans citations [n]), puis la liste courte des changements (ou dis qu'il n'y en a pas).`,
  };
}

/** Ce qui peut être appliqué à la cible d'après la réponse (null si la réponse n'a aucun bloc attendu). */
export function targetPatch(answer: string): { text?: string; detail?: string } | null {
  const text = extractFence(answer, TEXT_FENCE);
  const detail = extractFence(answer, DETAIL_FENCE);
  if (text === null && detail === null) return null;
  return {
    ...(text !== null ? { text: stripCitations(text).trim() } : {}),
    ...(detail !== null ? { detail: stripCitations(detail).trim() } : {}),
  };
}
