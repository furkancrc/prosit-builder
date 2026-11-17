import type { Content, DocType, Meta } from "./schema";

/**
 * Synchronisation éditeur → fenêtre de présentation (même navigateur) via BroadcastChannel.
 * `active` : 0 = en-tête du prosit, i + 1 = section i du template.
 */
export type PresentationMessage =
  | { kind: "state"; tab: DocType; meta: Meta; content: Content; active: number }
  | { kind: "hello" };

export const channelName = (prositId: string) => `prosit-presentation-${prositId}`;
