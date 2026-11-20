import { z } from "zod";

export const MAX_LEVEL = 2;

/** Un élément de liste : stocké « à plat » avec un niveau d'indentation (0 à MAX_LEVEL). */
export const PisteStatusSchema = z.enum(["valid", "partial", "invalid"]);
export type PisteStatus = z.infer<typeof PisteStatusSchema>;

/** Blocs de contenu riche sous un élément du prosit retour. */
export const RichBlockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().max(64), type: z.literal("text"), text: z.string().max(20000) }),
  z.object({
    id: z.string().max(64),
    type: z.literal("images"),
    /** Nombre de colonnes de la grille (1 = pleine largeur). */
    columns: z.number().int().min(1).max(3),
    images: z.array(z.object({ assetId: z.string().max(64), caption: z.string().max(500) })).max(12),
  }),
  z.object({
    id: z.string().max(64),
    type: z.literal("table"),
    header: z.boolean(),
    rows: z.array(z.array(z.string().max(2000)).max(8)).max(60),
  }),
]);
export type RichBlock = z.infer<typeof RichBlockSchema>;

export const ListItemSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(5000),
  level: z.number().int().min(0).max(MAX_LEVEL),
  /** Prosit retour : définition / explication de l'élément. */
  detail: z.string().max(10000).optional(),
  /** Prosit retour : statut d'une piste de solution. */
  status: PisteStatusSchema.optional(),
  /** Prosit retour : contenu riche (paragraphes, images, tableaux) sous l'élément. */
  blocks: z.array(RichBlockSchema).max(40).optional(),
});
export type ListItem = z.infer<typeof ListItemSchema>;

/**
 * color : couleur franche (boutons, légende) ; highlight : surlignage du texte dans le document,
 * comme les pistes et AAV surlignés du modèle « PrositRetourPBL1.docx ».
 */
export const STATUS_META: Record<PisteStatus, { label: string; short: string; color: string; highlight: string; symbol: string }> = {
  valid: { label: "Validée", short: "Validée", color: "#2E7D32", highlight: "#9BE89B", symbol: "✔" },
  partial: { label: "Partiellement validée", short: "Partielle", color: "#E67E00", highlight: "#FFC870", symbol: "◐" },
  invalid: { label: "Non validée", short: "Non validée", color: "#C62828", highlight: "#FF8A8A", symbol: "✘" },
};

export const FieldValueSchema = z.union([z.string().max(50000), z.array(ListItemSchema).max(500)]);
export type FieldValue = z.infer<typeof FieldValueSchema>;

export const ContentSchema = z.record(z.string().max(64), FieldValueSchema);
export type Content = z.infer<typeof ContentSchema>;

export const DocTypeSchema = z.enum(["aller", "retour"]);
export type DocType = z.infer<typeof DocTypeSchema>;

const short = z.string().trim().max(200);

export const MetaSchema = z.object({
  nom: short,
  theme: short,
  numero: z.string().trim().max(20),
  bloc: short,
  date: z.string().trim().max(40),
  auteur: short,
  groupe: short,
  /** Lien vers le sujet du prosit (Moodle, Teams…). Non exporté dans le document. */
  // Pas de validation stricte : la saisie est enregistrée au fil de la frappe.
  lien: z.string().trim().max(500),
});
export type Meta = z.infer<typeof MetaSchema>;
export const MetaPatchSchema = MetaSchema.partial();
export type MetaPatch = z.infer<typeof MetaPatchSchema>;

export const DOC_FONTS = ["Arial", "Calibri", "Times New Roman", "Cambria", "Courier New"] as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale attendue (#RRGGBB)");

export const SettingsSchema = z.object({
  auteur: short,
  groupe: short,
  bloc: short,
  filenameTemplate: z.string().trim().min(1).max(200),
  accentColor: hexColor,
  docSecondaryColor: hexColor,
  colorMode: z.enum(["light", "dark"]),
  docFont: z.enum(DOC_FONTS),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  auteur: "",
  groupe: "FISA A3",
  bloc: "",
  filenameTemplate: "Prosit_{type}_{theme}_-_{numero}",
  accentColor: "#FFE600",
  docSecondaryColor: "#EE85A0",
  colorMode: "light",
  docFont: "Arial",
};

/** Réordonne/valide une liste à plat : le premier élément est au niveau 0, chaque niveau ≤ précédent + 1. */
export function normalizeList(items: ListItem[]): ListItem[] {
  let prev = -1;
  return items.map((it) => {
    const level = Math.max(0, Math.min(it.level, prev + 1, MAX_LEVEL));
    prev = level;
    return level === it.level ? it : { ...it, level };
  });
}
