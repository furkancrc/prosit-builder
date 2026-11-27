import type { DocType } from "../schema";
import { INSERT_FENCE } from "./insert";

export interface ContextLink {
  url: string;
  ok: boolean;
  title?: string;
  text?: string;
  error?: string;
}

/** Consignes système de l'assistant de rédaction. */
export function buildInstructions(): string {
  return [
    "Tu es l'assistant de rédaction d'un étudiant ingénieur du CESI qui rédige ses prosits (pédagogie PBL, « Boucle PBL »).",
    "Un prosit aller contient : Rôles, I Mots clés (termes importants du sujet), II Mots inconnus (termes de l'énoncé que le groupe ne connaît pas), III Contexte, IV Problématique, V Contraintes, VI Livrables, VII Généralisation, VIII Pistes de solution (hypothèses), IX Plan d'action (Études, Réalisation).",
    "Le prosit retour (qui sert de CER) reprend l'aller avec une définition ou explication sous chaque élément, un statut sur chaque piste (validée / partielle / non validée), puis Synthèse, Questions du tuteur, AAV et Sources.",
    "",
    "Règles :",
    "- Tu réponds uniquement à ce que l'étudiant demande, en français, de façon concise. Tu ne réécris pas tout le prosit si on ne te le demande pas.",
    "- Tu t'appuies d'abord sur le document actuel et sur les ressources d'aide fournies par l'école ; tu complètes par la recherche web si besoin, en citant tes sources.",
    "- Tu n'inventes pas de faits sur le sujet du prosit : si une information manque, dis-le.",
    "- Pour un prosit aller, reste au niveau d'un groupe qui découvre le sujet : pistes = hypothèses à vérifier, pas des réponses définitives.",
    "- Une correction garde le sens et le style de l'étudiant : orthographe, grammaire, clarté, précision des termes.",
    `- Quand tu proposes du contenu à mettre dans une rubrique, place-le dans un bloc de code \`\`\`${INSERT_FENCE} … \`\`\` : une ligne par élément commençant par « - », deux espaces d'indentation par sous-niveau, et « terme : définition » quand la rubrique a des définitions. Pas de citations [n] dans ce bloc. Les explications éventuelles vont en dehors du bloc.`,
    "- Tu peux utiliser **gras** ; pas de titres Markdown dans le bloc à insérer.",
  ].join("\n");
}

/** Message de contexte : le document courant (et l'aller pour un retour) + les ressources d'aide lues. */
export function buildContext(opts: { type: DocType; docText: string; allerText?: string; focus?: string; links: ContextLink[] }): string {
  const parts: string[] = [];
  parts.push(`Document en cours de rédaction (prosit ${opts.type}) :`, "<<<DOCUMENT", opts.docText, "DOCUMENT>>>");
  if (opts.allerText) parts.push("", "Prosit aller correspondant (pour référence) :", "<<<ALLER", opts.allerText, "ALLER>>>");
  if (opts.focus) parts.push("", `Rubrique sur laquelle l'étudiant travaille : ${opts.focus}`);

  const read = opts.links.filter((l) => l.ok && l.text);
  const failed = opts.links.filter((l) => !l.ok);
  if (read.length) {
    parts.push("", "Ressources d'aide fournies par l'école (texte extrait des pages) :");
    for (const l of read) parts.push("", `<<<RESSOURCE ${l.url}${l.title ? ` — ${l.title}` : ""}`, l.text!, "RESSOURCE>>>");
  }
  if (failed.length) {
    parts.push("", "Liens d'aide que le serveur n'a pas pu lire (tu peux les consulter via la recherche web si ils sont publics) :");
    for (const l of failed) parts.push(`- ${l.url} (${l.error})`);
  }
  return parts.join("\n");
}
