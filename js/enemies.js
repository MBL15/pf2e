import { CREATURE_TYPES, SIZES, getCreatureBaseline } from "./pf2e-data.js";
import { putEnemies } from "./api.js";

const STORAGE_KEY = "glubiny-pf2e-enemies-v1";

/**
 * @typedef {Object} Enemy
 * @property {string} id
 * @property {'enemy'} kind
 * @property {string} name
 * @property {number} level
 * @property {string} creatureType
 * @property {string} creatureTypeName
 * @property {string} size
 * @property {string} sizeName
 * @property {number} hp
 * @property {number} hpMax
 * @property {number} ac
 * @property {number} fort
 * @property {number} ref
 * @property {number} will
 * @property {number} perception
 * @property {number} speed
 * @property {number} attackBonus
 * @property {string} damage
 * @property {string} traits
 * @property {string} color
 * @property {string} symbol
 * @property {string} note
 */

const DEFAULT_COLORS = ["#7f1d1d", "#9a3412", "#854d0e", "#3f3f46", "#4c1d95", "#134e4a"];

/**
 * @param {unknown} raw
 * @returns {Enemy[]}
 */
export function hydrateEnemies(raw) {
  if (Array.isArray(raw) && raw.length) {
    return raw.map((e) => makeEnemy(e));
  }
  return seedDefaults();
}

/**
 * @returns {Enemy[]|null}
 */
export function readLegacyEnemies() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((e) => makeEnemy(e));
  } catch {
    return null;
  }
}

/**
 * @param {Enemy[]} list
 * @returns {Promise<void>}
 */
export async function saveEnemies(list) {
  await putEnemies(list);
}

function seedDefaults() {
  return [
    makeEnemy({ name: "Гоблин-воин", level: 1, creatureType: "humanoid", recalculate: true }),
    makeEnemy({ name: "Волк", level: 1, creatureType: "animal", symbol: "🐺", color: "#57534e", recalculate: true }),
    makeEnemy({ name: "Скелет-страж", level: 2, creatureType: "undead", symbol: "☠", color: "#a8a29e", recalculate: true }),
  ];
}

/**
 * @param {Partial<Enemy> & { recalculate?: boolean }} data
 * @returns {Enemy}
 */
export function makeEnemy(data = {}) {
  const level = Math.max(-1, Math.min(20, Number(data.level) ?? 1));
  const baseline = getCreatureBaseline(level);
  const typeId = data.creatureType || "humanoid";
  const type = CREATURE_TYPES.find((t) => t.id === typeId) || CREATURE_TYPES[8];
  const sizeId = data.size || "medium";
  const size = SIZES.find((s) => s.id === sizeId) || SIZES[2];
  const shouldRecalc = data.recalculate || data.hp == null || data.ac == null;

  const hpMax = shouldRecalc ? baseline.hp : Number(data.hpMax ?? data.hp) || baseline.hp;

  return {
    id: data.id || crypto.randomUUID(),
    kind: "enemy",
    name: (data.name || "Безымянный").trim().slice(0, 40),
    level,
    creatureType: type.id,
    creatureTypeName: type.name,
    size: size.id,
    sizeName: size.name,
    hp: Number(data.hp) || hpMax,
    hpMax,
    ac: shouldRecalc ? baseline.ac : Number(data.ac) || baseline.ac,
    fort: data.fort != null && !shouldRecalc ? Number(data.fort) : baseline.fort,
    ref: data.ref != null && !shouldRecalc ? Number(data.ref) : baseline.ref,
    will: data.will != null && !shouldRecalc ? Number(data.will) : baseline.will,
    perception: data.perception != null && !shouldRecalc ? Number(data.perception) : baseline.perception,
    speed: Number(data.speed) || 25,
    attackBonus: data.attackBonus != null && !shouldRecalc ? Number(data.attackBonus) : baseline.attack,
    damage: data.damage || baseline.damage,
    traits: data.traits || "",
    color: data.color || DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)],
    symbol: data.symbol || "☠",
    note: (data.note || "").slice(0, 200),
  };
}

/**
 * @param {Enemy} en
 */
export function recalculateEnemy(en) {
  return makeEnemy({ ...en, recalculate: true });
}
