import { getCreatureBaseline, CREATURE_TYPES, SIZES } from "./pf2e-data.js";
import { makeEnemy } from "./enemies.js";

/** @typedef {Object} BestiaryEntry
 * @property {string} id
 * @property {string} name
 * @property {number} level
 * @property {number} hp
 * @property {number} ac
 * @property {number} fort
 * @property {number} ref
 * @property {number} will
 * @property {number} perception
 * @property {number} speed
 * @property {string} size
 * @property {string} creatureType
 * @property {string[]} traits
 * @property {number|null} attackBonus
 * @property {string} damage
 * @property {string} source
 * @property {number|null} [aonId]
 * @property {string} [aonUrl]
 * @property {string} note
 */

/** @type {BestiaryEntry[] | null} */
let cache = null;
/** @type {Promise<BestiaryEntry[]> | null} */
let loading = null;

export async function loadBestiary() {
  if (cache) return cache;
  if (loading) return loading;
  loading = fetch("./data/bestiary.json")
    .then((r) => {
      if (!r.ok) throw new Error("Не удалось загрузить бестиарий");
      return r.json();
    })
    .then((data) => {
      cache = Array.isArray(data) ? data : [];
      loading = null;
      return cache;
    })
    .catch((err) => {
      loading = null;
      throw err;
    });
  return loading;
}

/**
 * @param {BestiaryEntry[]} list
 * @param {{ query?: string, levelMin?: number|null, levelMax?: number|null, creatureType?: string, sort?: string }} filters
 */
export function filterBestiary(list, filters = {}) {
  const q = (filters.query || "").trim().toLowerCase();
  const type = filters.creatureType || "";
  const levelMin = filters.levelMin;
  const levelMax = filters.levelMax;

  let out = list.filter((e) => {
    if (type && e.creatureType !== type) return false;
    if (levelMin != null && e.level < levelMin) return false;
    if (levelMax != null && e.level > levelMax) return false;
    if (!q) return true;
    const hay = `${e.name} ${(e.traits || []).join(" ")} ${e.source}`.toLowerCase();
    return hay.includes(q);
  });

  if (filters.sort === "name") {
    out = [...out].sort((a, b) => a.name.localeCompare(b.name, "en"));
  } else {
    out = [...out].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "en"));
  }
  return out;
}

/**
 * @param {BestiaryEntry} entry
 */
export function pf2Url(entry) {
  if (entry.id) return `https://www.pf2.ru/monsters/${entry.id}`;
  return "https://www.pf2.ru/monsters";
}

/**
 * @param {BestiaryEntry} entry
 */
export function aonUrl(entry) {
  if (entry.aonUrl) return entry.aonUrl;
  if (entry.aonId) return `https://2e.aonprd.com/Monsters.aspx?ID=${entry.aonId}`;
  return "https://2e.aonprd.com/Monsters.aspx";
}

/**
 * @param {BestiaryEntry} entry
 */
export function bestiaryToEnemy(entry) {
  const baseline = getCreatureBaseline(entry.level);
  const type = CREATURE_TYPES.find((t) => t.id === entry.creatureType);
  const size = SIZES.find((s) => s.id === entry.size);
  const traits = (entry.traits || []).join(", ");

  return makeEnemy({
    name: entry.name.slice(0, 28),
    level: entry.level,
    creatureType: type?.id || "beast",
    size: size?.id || "medium",
    hp: entry.hp,
    hpMax: entry.hp,
    ac: entry.ac,
    fort: entry.fort,
    ref: entry.ref,
    will: entry.will,
    perception: entry.perception,
    speed: entry.speed || 25,
    attackBonus: entry.attackBonus ?? baseline.attack,
    damage: entry.damage || baseline.damage,
    traits: traits.slice(0, 80),
    note: [`Бестиарий: ${entry.source || "PF2e"}`, entry.note].filter(Boolean).join(" — ").slice(0, 200),
    symbol: pickSymbol(entry),
    color: pickColor(entry),
    recalculate: false,
  });
}

/**
 * @param {BestiaryEntry} entry
 */
function pickSymbol(entry) {
  const traits = (entry.traits || []).map((t) => t.toLowerCase());
  if (traits.some((t) => t.includes("undead") || t.includes("skeleton"))) return "☠";
  if (traits.some((t) => t.includes("dragon"))) return "✦";
  if (traits.some((t) => t.includes("animal") || t.includes("beast"))) return "🐺";
  if (traits.some((t) => t.includes("fiend") || t.includes("demon") || t.includes("devil"))) return "🔥";
  if (traits.some((t) => t.includes("construct"))) return "🦴";
  return "👁";
}

/**
 * @param {BestiaryEntry} entry
 */
function pickColor(entry) {
  const map = {
    undead: "#a8a29e",
    dragon: "#7c3aed",
    fiend: "#9a3412",
    animal: "#57534e",
    beast: "#78716c",
    construct: "#64748b",
    elemental: "#0e7490",
    fey: "#15803d",
    giant: "#92400e",
    humanoid: "#7f1d1d",
    ooze: "#65a30d",
    plant: "#166534",
    spirit: "#6366f1",
    aberration: "#6b21a8",
    monitor: "#1d4ed8",
  };
  return map[entry.creatureType] || "#7f1d1d";
}

export function formatMod(n) {
  const v = Number(n) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
}
