import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ContentSchema,
  DEFAULT_SETTINGS,
  HelpLinksSchema,
  MetaPatchSchema,
  SettingsSchema,
  type Content,
  type DocType,
  type Meta,
  type MetaPatch,
  type Settings,
} from "./schema";
import { emptyContent, getTemplate } from "./templates";

const g = globalThis as unknown as { __prositDb?: Database.Database };

function open(): Database.Database {
  const dir = path.resolve(process.env.DATA_DIR || "./data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "prosit.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS prosits (
        id TEXT PRIMARY KEY,
        nom TEXT NOT NULL DEFAULT '',
        theme TEXT NOT NULL DEFAULT '',
        numero TEXT NOT NULL DEFAULT '',
        bloc TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL DEFAULT '',
        auteur TEXT NOT NULL DEFAULT '',
        groupe TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        prosit_id TEXT NOT NULL REFERENCES prosits(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('aller','retour')),
        meta_overrides TEXT NOT NULL DEFAULT '{}',
        content TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL,
        UNIQUE (prosit_id, type)
      );
      PRAGMA user_version = 1;
    `);
  }
  if (version < 2) {
    db.exec(`
      ALTER TABLE prosits ADD COLUMN lien TEXT NOT NULL DEFAULT '';
      PRAGMA user_version = 2;
    `);
  }
  if (version < 3) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        mime TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      PRAGMA user_version = 3;
    `);
  }
  if (version < 4) {
    db.exec(`
      ALTER TABLE prosits ADD COLUMN liens_aide TEXT NOT NULL DEFAULT '[]';
      PRAGMA user_version = 4;
    `);
  }
  if (version < 5) {
    // Dossiers : une année (FISA A3, A4, A5…) contient des matières (blocs de formation), qui contiennent les prosits.
    db.exec(`
      CREATE TABLE IF NOT EXISTS annees (
        id TEXT PRIMARY KEY,
        nom TEXT NOT NULL,
        ordre INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS matieres (
        id TEXT PRIMARY KEY,
        annee_id TEXT NOT NULL REFERENCES annees(id) ON DELETE CASCADE,
        nom TEXT NOT NULL,
        debut TEXT NOT NULL DEFAULT '',
        fin TEXT NOT NULL DEFAULT '',
        ordre INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      ALTER TABLE prosits ADD COLUMN matiere_id TEXT REFERENCES matieres(id) ON DELETE SET NULL;
      PRAGMA user_version = 5;
    `);
    seedDossiers(db);
  }
}

/** Années FISA A3 à A5, et les blocs de formation de l'A3 (calendrier 2026-27). */
function seedDossiers(db: Database.Database) {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM annees").get() as { n: number }).n;
  if (count) return;
  const t = now();
  const addYear = db.prepare("INSERT INTO annees (id, nom, ordre, created_at) VALUES (?, ?, ?, ?)");
  const addMatiere = db.prepare("INSERT INTO matieres (id, annee_id, nom, debut, fin, ordre, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const a3 = randomUUID();
  addYear.run(a3, "FISA A3", 3, t);
  addYear.run(randomUUID(), "FISA A4", 4, t);
  addYear.run(randomUUID(), "FISA A5", 5, t);
  const blocs: [string, string, string][] = [
    ["S.I - Sécurité et administration", "2026-11-16", "2026-12-18"],
    ["Génie logiciel", "2027-01-25", "2027-02-26"],
    ["Recherche opérationnelle", "2027-04-12", "2027-05-05"],
    ["Développement d'applications distribuées", "2027-05-31", "2027-06-24"],
  ];
  blocs.forEach(([nom, debut, fin], i) => addMatiere.run(randomUUID(), a3, nom, debut, fin, i, t));
}

// Réinitialisé à chaque (re)chargement du module : en dev, la connexion mise en cache
// sur globalThis survit au rechargement à chaud, mais les nouvelles migrations doivent s'appliquer.
let migrated = false;

export function db(): Database.Database {
  if (!g.__prositDb) g.__prositDb = open();
  if (!migrated) {
    migrate(g.__prositDb);
    migrated = true;
  }
  return g.__prositDb;
}

const now = () => new Date().toISOString();

// ---------- Réglages ----------

export function getSettings(): Settings {
  const row = db().prepare("SELECT data FROM settings WHERE id = 1").get() as { data: string } | undefined;
  if (!row) return DEFAULT_SETTINGS;
  const parsed = SettingsSchema.partial().safeParse(JSON.parse(row.data));
  return { ...DEFAULT_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}

export function saveSettings(s: Settings): Settings {
  const data = SettingsSchema.parse(s);
  db()
    .prepare("INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data")
    .run(JSON.stringify(data));
  return data;
}

// ---------- Prosits ----------

export interface PrositRow extends Meta {
  id: string;
  /** Liens d'aide donnés par l'école, passés en contexte à l'assistant IA (non exportés). */
  liensAide: string[];
  /** Matière (bloc de formation) qui range le prosit ; null = non classé. */
  matiereId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRow {
  id: string;
  prositId: string;
  type: DocType;
  metaOverrides: MetaPatch;
  content: Content;
  updatedAt: string;
}

const PROSIT_COLS = "id, nom, theme, numero, bloc, date, auteur, groupe, lien, liens_aide AS liensAide, matiere_id AS matiereId, created_at AS createdAt, updated_at AS updatedAt";

type RawProsit = Omit<PrositRow, "liensAide"> & { liensAide: string };

function rowToProsit(r: RawProsit): PrositRow {
  const links = HelpLinksSchema.safeParse(JSON.parse(r.liensAide || "[]"));
  return { ...r, liensAide: links.success ? links.data : [] };
}

export function listProsits(): PrositRow[] {
  return (db().prepare(`SELECT ${PROSIT_COLS} FROM prosits ORDER BY updated_at DESC`).all() as RawProsit[]).map(rowToProsit);
}

export function getProsit(id: string): PrositRow | undefined {
  const r = db().prepare(`SELECT ${PROSIT_COLS} FROM prosits WHERE id = ?`).get(id) as RawProsit | undefined;
  return r && rowToProsit(r);
}

export function setHelpLinks(id: string, links: string[]): string[] | undefined {
  const clean = HelpLinksSchema.parse(links);
  const changes = db().prepare("UPDATE prosits SET liens_aide = ? WHERE id = ?").run(JSON.stringify(clean), id).changes;
  return changes ? clean : undefined;
}

function rowToDoc(r: { id: string; prosit_id: string; type: DocType; meta_overrides: string; content: string; updated_at: string }): DocumentRow {
  const mo = MetaPatchSchema.safeParse(JSON.parse(r.meta_overrides));
  const c = ContentSchema.safeParse(JSON.parse(r.content));
  return {
    id: r.id,
    prositId: r.prosit_id,
    type: r.type,
    metaOverrides: mo.success ? mo.data : {},
    content: c.success ? c.data : {},
    updatedAt: r.updated_at,
  };
}

export function getDocuments(prositId: string): DocumentRow[] {
  const rows = db().prepare("SELECT * FROM documents WHERE prosit_id = ? ORDER BY type").all(prositId) as Parameters<typeof rowToDoc>[0][];
  return rows.map(rowToDoc);
}

export function getDocument(id: string): DocumentRow | undefined {
  const r = db().prepare("SELECT * FROM documents WHERE id = ?").get(id) as Parameters<typeof rowToDoc>[0] | undefined;
  return r && rowToDoc(r);
}

export function createProsit(meta: Partial<Meta>, contents?: Partial<Record<DocType, Content>>, matiereId?: string | null): string {
  const s = getSettings();
  const id = randomUUID();
  const t = now();
  // Créé dans une matière : le bloc et le groupe du document en sont déduits.
  const place = matiereId
    ? (db().prepare("SELECT m.nom AS bloc, a.nom AS groupe FROM matieres m JOIN annees a ON a.id = m.annee_id WHERE m.id = ?").get(matiereId) as { bloc: string; groupe: string } | undefined)
    : undefined;
  if (matiereId && !place) throw new UnknownMatiereError();
  const m: Meta = {
    nom: meta.nom ?? "Nouveau prosit",
    theme: meta.theme ?? "",
    numero: meta.numero ?? "",
    bloc: meta.bloc ?? place?.bloc ?? s.bloc,
    date: meta.date ?? t.slice(0, 10),
    auteur: meta.auteur ?? s.auteur,
    groupe: meta.groupe ?? place?.groupe ?? s.groupe,
    lien: meta.lien ?? "",
  };
  const tx = db().transaction(() => {
    db()
      .prepare(
        "INSERT INTO prosits (id, nom, theme, numero, bloc, date, auteur, groupe, lien, matiere_id, created_at, updated_at) VALUES (@id, @nom, @theme, @numero, @bloc, @date, @auteur, @groupe, @lien, @matiereId, @t, @t)",
      )
      .run({ id, ...m, matiereId: matiereId ?? null, t });
    for (const type of ["aller", "retour"] as const) {
      db()
        .prepare("INSERT INTO documents (id, prosit_id, type, meta_overrides, content, updated_at) VALUES (?, ?, ?, '{}', ?, ?)")
        .run(randomUUID(), id, type, JSON.stringify(contents?.[type] ?? emptyContent(getTemplate(type))), t);
    }
  });
  tx();
  return id;
}

export function updateProsit(id: string, patch: MetaPatch): PrositRow | undefined {
  const p = MetaPatchSchema.parse(patch);
  const keys = Object.keys(p) as (keyof Meta)[];
  if (keys.length) {
    db()
      .prepare(`UPDATE prosits SET ${keys.map((k) => `${k} = @${k}`).join(", ")}, updated_at = @t WHERE id = @id`)
      .run({ ...p, id, t: now() });
  }
  return getProsit(id);
}

export function deleteProsit(id: string): boolean {
  return db().prepare("DELETE FROM prosits WHERE id = ?").run(id).changes > 0;
}

export function duplicateProsit(id: string): string | undefined {
  const p = getProsit(id);
  if (!p) return undefined;
  const docs = getDocuments(id);
  const newId = createProsit(
    { nom: `${p.nom} (copie)`, theme: p.theme, numero: p.numero, bloc: p.bloc, date: p.date, auteur: p.auteur, groupe: p.groupe, lien: p.lien },
    Object.fromEntries(docs.map((d) => [d.type, d.content])),
  );
  setHelpLinks(newId, p.liensAide);
  setPrositMatiere(newId, p.matiereId);
  for (const d of docs) {
    if (Object.keys(d.metaOverrides).length) {
      db().prepare("UPDATE documents SET meta_overrides = ? WHERE prosit_id = ? AND type = ?").run(JSON.stringify(d.metaOverrides), newId, d.type);
    }
  }
  return newId;
}

export function updateDocument(id: string, patch: { content?: Content; metaOverrides?: MetaPatch }): DocumentRow | undefined {
  const d = getDocument(id);
  if (!d) return undefined;
  const t = now();
  const content = patch.content ? ContentSchema.parse(patch.content) : d.content;
  const mo = patch.metaOverrides ? MetaPatchSchema.parse(patch.metaOverrides) : d.metaOverrides;
  const tx = db().transaction(() => {
    db().prepare("UPDATE documents SET content = ?, meta_overrides = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(content), JSON.stringify(mo), t, id);
    db().prepare("UPDATE prosits SET updated_at = ? WHERE id = ?").run(t, d.prositId);
  });
  tx();
  return getDocument(id);
}

// ---------- Dossiers : années et matières ----------

export class UnknownMatiereError extends Error {
  constructor() {
    super("Matière introuvable");
  }
}

export interface MatiereRow {
  id: string;
  anneeId: string;
  nom: string;
  /** Dates du bloc (AAAA-MM-JJ), facultatives. */
  debut: string;
  fin: string;
  ordre: number;
}

export interface AnneeRow {
  id: string;
  nom: string;
  ordre: number;
  matieres: MatiereRow[];
}

export function listDossiers(): AnneeRow[] {
  const annees = db().prepare("SELECT id, nom, ordre FROM annees ORDER BY ordre, created_at").all() as Omit<AnneeRow, "matieres">[];
  const matieres = db()
    .prepare("SELECT id, annee_id AS anneeId, nom, debut, fin, ordre FROM matieres ORDER BY ordre, debut, created_at")
    .all() as MatiereRow[];
  return annees.map((a) => ({ ...a, matieres: matieres.filter((m) => m.anneeId === a.id) }));
}

export function createAnnee(nom: string): string {
  const id = randomUUID();
  const max = (db().prepare("SELECT COALESCE(MAX(ordre), 0) AS m FROM annees").get() as { m: number }).m;
  db().prepare("INSERT INTO annees (id, nom, ordre, created_at) VALUES (?, ?, ?, ?)").run(id, nom, max + 1, now());
  return id;
}

export function renameAnnee(id: string, nom: string): boolean {
  return db().prepare("UPDATE annees SET nom = ? WHERE id = ?").run(nom, id).changes > 0;
}

/** Supprime l'année et ses matières ; les prosits qu'elles contenaient deviennent « non classés ». */
export function deleteAnnee(id: string): boolean {
  return db().prepare("DELETE FROM annees WHERE id = ?").run(id).changes > 0;
}

export function createMatiere(anneeId: string, m: { nom: string; debut?: string; fin?: string }): string | undefined {
  if (!db().prepare("SELECT 1 FROM annees WHERE id = ?").get(anneeId)) return undefined;
  const id = randomUUID();
  const max = (db().prepare("SELECT COALESCE(MAX(ordre), -1) AS m FROM matieres WHERE annee_id = ?").get(anneeId) as { m: number }).m;
  db()
    .prepare("INSERT INTO matieres (id, annee_id, nom, debut, fin, ordre, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, anneeId, m.nom, m.debut ?? "", m.fin ?? "", max + 1, now());
  return id;
}

export function updateMatiere(id: string, patch: { nom?: string; debut?: string; fin?: string }): boolean {
  const keys = (["nom", "debut", "fin"] as const).filter((k) => patch[k] !== undefined);
  if (!keys.length) return !!db().prepare("SELECT 1 FROM matieres WHERE id = ?").get(id);
  return db().prepare(`UPDATE matieres SET ${keys.map((k) => `${k} = @${k}`).join(", ")} WHERE id = @id`).run({ ...patch, id }).changes > 0;
}

export function deleteMatiere(id: string): boolean {
  return db().prepare("DELETE FROM matieres WHERE id = ?").run(id).changes > 0;
}

/** Range un prosit dans une matière (null = non classé). */
export function setPrositMatiere(id: string, matiereId: string | null): boolean {
  if (matiereId && !db().prepare("SELECT 1 FROM matieres WHERE id = ?").get(matiereId)) throw new UnknownMatiereError();
  return db().prepare("UPDATE prosits SET matiere_id = ? WHERE id = ?").run(matiereId, id).changes > 0;
}
