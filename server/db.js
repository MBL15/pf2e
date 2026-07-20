import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "glubiny.sqlite");

/** @type {DatabaseSync | null} */
let db = null;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

/**
 * @param {string} key
 * @returns {unknown | null}
 */
export function kvGet(key) {
  const row = getDb().prepare("SELECT value FROM kv WHERE key = ?").get(key);
  if (!row) return null;
  try {
    return JSON.parse(/** @type {{value:string}} */ (row).value);
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function kvSet(key, value) {
  const json = JSON.stringify(value);
  getDb()
    .prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, json);
}

/**
 * @param {string} key
 */
export function kvDelete(key) {
  getDb().prepare("DELETE FROM kv WHERE key = ?").run(key);
}

export function loadFullState() {
  return {
    accounts: kvGet("accounts"),
    characters: kvGet("characters"),
    enemies: kvGet("enemies"),
    map: kvGet("map"),
  };
}

/**
 * @param {Partial<{accounts:unknown,characters:unknown,enemies:unknown,map:unknown}>} partial
 */
export function saveFullState(partial) {
  if ("accounts" in partial) kvSet("accounts", partial.accounts);
  if ("characters" in partial) kvSet("characters", partial.characters);
  if ("enemies" in partial) kvSet("enemies", partial.enemies);
  if ("map" in partial) kvSet("map", partial.map);
}

export function getDbPath() {
  return DB_PATH;
}
