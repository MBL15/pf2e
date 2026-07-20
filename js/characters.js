import {
  ANCESTRIES,
  BACKGROUNDS,
  CLASSES,
  SKILLS,
  suggestAbilityMods,
  calcPcHp,
  calcPcAc,
  calcPcSaves,
} from "./pf2e-data.js";
import { putCharacters } from "./api.js";

const STORAGE_KEY = "glubiny-pf2e-pcs-v2";
const LEGACY_KEY_V1 = "glubiny-pf2e-pcs-v1";
const LEGACY_KEY = "glubiny-characters-v1";

/** @typedef {import('./pf2e-data.js').AbilityId} AbilityId */

/**
 * @typedef {Object} Character
 * @property {string} id
 * @property {'pc'} kind
 * @property {string} name
 * @property {number} level
 * @property {string} ancestryId
 * @property {string} ancestryName
 * @property {string} backgroundId
 * @property {string} backgroundName
 * @property {string} classId
 * @property {string} className
 * @property {Record<AbilityId, number>} abilities
 * @property {number} hp
 * @property {number} hpMax
 * @property {number} ac
 * @property {number} fort
 * @property {number} ref
 * @property {number} will
 * @property {number} perception
 * @property {number} speed
 * @property {string} size
 * @property {string} color
 * @property {string} symbol
 * @property {string} note
 * @property {string} bio
 * @property {string} attack
 * @property {string} portrait
 * @property {string[]} feats
 * @property {Record<string, number>} skills
 */

/** @typedef {{ actorId: string, actorType: 'pc'|'enemy', x: number, y: number }} TokenPlacement */

const DEFAULT_COLORS = ["#0f6b5c", "#2f6b8a", "#b45309", "#7a3a6a", "#15803d", "#b42318"];

/**
 * @param {unknown} raw
 * @returns {Character[]}
 */
export function hydrateCharacters(raw) {
  if (Array.isArray(raw) && raw.length) {
    return raw.map((c) => makeCharacter(c));
  }
  return seedDefaults();
}

/**
 * @returns {Character[]|null}
 */
export function readLegacyCharacters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY_V1);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed.map((c) => makeCharacter(c));
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy);
      if (Array.isArray(old) && old.length) {
        return old.map((c) =>
          makeCharacter({
            id: c.id,
            name: c.name,
            classId: mapLegacyClass(c.classId),
            color: c.color,
            symbol: c.symbol,
            note: c.note,
            hp: c.hp,
            ac: c.ac,
          })
        );
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {Character[]} list
 * @returns {Promise<void>}
 */
export async function saveCharacters(list) {
  await putCharacters(list);
}

function mapLegacyClass(id) {
  if (id === "paladin") return "champion";
  return CLASSES[id] ? id : "fighter";
}

function seedDefaults() {
  return [
    makeCharacter({
      name: "Торин",
      ancestryId: "dwarf",
      backgroundId: "warrior",
      classId: "fighter",
      color: "#b45309",
      symbol: "⚔",
      note: "Страж отряда",
      recalculate: true,
    }),
    makeCharacter({
      name: "Мира",
      ancestryId: "elf",
      backgroundId: "scholar",
      classId: "wizard",
      color: "#2f6b8a",
      symbol: "✦",
      note: "Огненные чары",
      recalculate: true,
    }),
    makeCharacter({
      name: "Шейд",
      ancestryId: "goblin",
      backgroundId: "street_urchin",
      classId: "rogue",
      color: "#15803d",
      symbol: "🗡",
      note: "Теневой шаг",
      recalculate: true,
    }),
  ];
}

/**
 * @param {Partial<Character> & { recalculate?: boolean }} data
 * @returns {Character}
 */
export function makeCharacter(data = {}) {
  const ancestryId = data.ancestryId && ANCESTRIES[data.ancestryId] ? data.ancestryId : "human";
  const backgroundId =
    data.backgroundId && BACKGROUNDS[data.backgroundId] ? data.backgroundId : "warrior";
  const classId = data.classId && CLASSES[data.classId] ? data.classId : "fighter";
  const ancestry = ANCESTRIES[ancestryId];
  const background = BACKGROUNDS[backgroundId];
  const cls = CLASSES[classId];
  const level = Math.max(1, Math.min(20, Number(data.level) || 1));

  /** @type {Record<AbilityId, number>} */
  let abilities = data.abilities
    ? { ...suggestAbilityMods(ancestryId, backgroundId, classId), ...data.abilities }
    : suggestAbilityMods(ancestryId, backgroundId, classId);

  const shouldRecalc = data.recalculate || data.hp == null || data.ac == null;
  const saves = calcPcSaves({
    classId,
    level,
    conMod: abilities.con,
    dexMod: abilities.dex,
    wisMod: abilities.wis,
  });

  const hpMax = shouldRecalc
    ? calcPcHp({ ancestryId, classId, level, conMod: abilities.con })
    : Number(data.hpMax ?? data.hp) || 10;

  return {
    id: data.id || crypto.randomUUID(),
    kind: "pc",
    name: (data.name || "Безымянный").trim().slice(0, 28),
    level,
    ancestryId,
    ancestryName: ancestry.name,
    backgroundId,
    backgroundName: background.name,
    classId,
    className: cls.name,
    abilities,
    hp: Number(data.hp) || hpMax,
    hpMax,
    ac: shouldRecalc ? calcPcAc({ level, dexMod: abilities.dex }) : Number(data.ac) || 10,
    fort: data.fort != null && !shouldRecalc ? Number(data.fort) : saves.fort,
    ref: data.ref != null && !shouldRecalc ? Number(data.ref) : saves.ref,
    will: data.will != null && !shouldRecalc ? Number(data.will) : saves.will,
    perception: data.perception != null && !shouldRecalc ? Number(data.perception) : saves.perception,
    speed: Number(data.speed) || ancestry.speed,
    size: data.size || ancestry.size,
    color: data.color || DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)],
    symbol: data.symbol || "⚔",
    note: (data.note || "").slice(0, 200),
    bio: (data.bio || data.note || "").slice(0, 1200),
    attack: data.attack || "",
    portrait: typeof data.portrait === "string" ? data.portrait : "",
    feats: Array.isArray(data.feats) ? data.feats.filter((f) => typeof f === "string").slice(0, 24) : [],
    skills: normalizeSkills(data.skills, background.skill),
  };
}

/**
 * @param {Record<string, number | string> | undefined} skills
 * @param {string} backgroundSkill
 */
function normalizeSkills(skills, backgroundSkill) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const s of SKILLS) {
    out[s.id] = normalizeSkillValue(skills?.[s.id]);
  }
  if (backgroundSkill && out[backgroundSkill] === 0) {
    out[backgroundSkill] = 1;
  }
  return out;
}

/**
 * @param {unknown} value
 */
function normalizeSkillValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(20, Math.round(value)));
  }
  if (typeof value === "string") {
    const legacy = {
      untrained: 0,
      trained: 1,
      expert: 2,
      master: 3,
      legendary: 4,
    };
    if (value in legacy) return legacy[/** @type {keyof typeof legacy} */ (value)];
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, Math.min(20, Math.round(n)));
  }
  return 0;
}

/**
 * Пересчитать боевые поля по правилам PF2e.
 * @param {Character} ch
 */
export function recalculateCharacter(ch) {
  return makeCharacter({ ...ch, recalculate: true });
}

/**
 * Унифицированный вид для отрисовки жетона.
 * @param {Character} ch
 */
export function asTokenActor(ch) {
  return {
    id: ch.id,
    name: ch.name,
    color: ch.color,
    symbol: ch.symbol,
    kind: "pc",
  };
}
