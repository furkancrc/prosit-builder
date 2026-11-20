import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ContentSchema,
  DEFAULT_SETTINGS,
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

const PROSIT_COLS = "id, nom, theme, numero, bloc, date, auteur, groupe, lien, created_at AS createdAt, updated_at AS updatedAt";

export function listProsits(): PrositRow[] {
  return db().prepare(`SELECT ${PROSIT_COLS} FROM prosits ORDER BY updated_at DESC`).all() as PrositRow[];
}

export function getProsit(id: string): PrositRow | undefined {
  return db().prepare(`SELECT ${PROSIT_COLS} FROM prosits WHERE id = ?`).get(id) as PrositRow | undefined;
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

export function createProsit(meta: Partial<Meta>, contents?: Partial<Record<DocType, Content>>): string {
  const s = getSettings();
  const id = randomUUID();
  const t = now();
  const m: Meta = {
    nom: meta.nom ?? "Nouveau prosit",
    theme: meta.theme ?? "",
    numero: meta.numero ?? "",
    bloc: meta.bloc ?? s.bloc,
    date: meta.date ?? t.slice(0, 10),
    auteur: meta.auteur ?? s.auteur,
    groupe: meta.groupe ?? s.groupe,
    lien: meta.lien ?? "",
  };
  const tx = db().transaction(() => {
    db()
      .prepare(
        "INSERT INTO prosits (id, nom, theme, numero, bloc, date, auteur, groupe, lien, created_at, updated_at) VALUES (@id, @nom, @theme, @numero, @bloc, @date, @auteur, @groupe, @lien, @t, @t)",
      )
      .run({ id, ...m, t });
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
