import { z } from "zod";

export const MAX_LEVEL = 2;

/** Un élément de liste : stocké « à plat » avec un niveau d'indentation (0 à MAX_LEVEL). */
export const ListItemSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(5000),
  level: z.number().int().min(0).max(MAX_LEVEL),
});
export type ListItem = z.infer<typeof ListItemSchema>;

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
  docHeadingColor: hexColor,
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
  docHeadingColor: "#4472C4",
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
