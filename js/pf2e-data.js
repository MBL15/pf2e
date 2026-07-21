/**
 * Справочные данные Pathfinder 2e (Player Core / создание существ).
 * Ориентир для игроков: https://pf2.ru/ и https://www.pf2.ru/
 */

/** @typedef {'str'|'dex'|'con'|'int'|'wis'|'cha'} AbilityId */

export const ABILITIES = [
  { id: "str", name: "Сила", short: "Сил" },
  { id: "dex", name: "Ловкость", short: "Лов" },
  { id: "con", name: "Выносливость", short: "Вын" },
  { id: "int", name: "Интеллект", short: "Инт" },
  { id: "wis", name: "Мудрость", short: "Мдр" },
  { id: "cha", name: "Харизма", short: "Хар" },
];

export const SIZES = [
  { id: "tiny", name: "Крошечный" },
  { id: "small", name: "Маленький" },
  { id: "medium", name: "Средний" },
  { id: "large", name: "Большой" },
  { id: "huge", name: "Огромный" },
  { id: "gargantuan", name: "Исполинский" },
];

/** Народы (ancestries) — базовые значения Player Core. */
export const ANCESTRIES = {
  human: {
    id: "human",
    name: "Человек",
    hp: 8,
    size: "medium",
    speed: 25,
    boosts: ["free", "free"],
    flaw: null,
    url: "https://www.pf2.ru/ancestries/human",
  },
  dwarf: {
    id: "dwarf",
    name: "Дварф",
    hp: 10,
    size: "medium",
    speed: 20,
    boosts: ["con", "wis", "free"],
    flaw: "cha",
    url: "https://www.pf2.ru/ancestries/dwarf",
  },
  elf: {
    id: "elf",
    name: "Эльф",
    hp: 6,
    size: "medium",
    speed: 30,
    boosts: ["dex", "int", "free"],
    flaw: "con",
    url: "https://www.pf2.ru/ancestries/elf",
  },
  gnome: {
    id: "gnome",
    name: "Гном",
    hp: 8,
    size: "small",
    speed: 25,
    boosts: ["con", "cha", "free"],
    flaw: "str",
    url: "https://www.pf2.ru/ancestries/gnome",
  },
  goblin: {
    id: "goblin",
    name: "Гоблин",
    hp: 6,
    size: "small",
    speed: 25,
    boosts: ["dex", "cha", "free"],
    flaw: "wis",
    url: "https://www.pf2.ru/ancestries/goblin",
  },
  halfling: {
    id: "halfling",
    name: "Полурослик",
    hp: 6,
    size: "small",
    speed: 25,
    boosts: ["dex", "wis", "free"],
    flaw: "str",
    url: "https://www.pf2.ru/ancestries/halfling",
  },
  leshy: {
    id: "leshy",
    name: "Леший",
    hp: 8,
    size: "small",
    speed: 25,
    boosts: ["con", "wis", "free"],
    flaw: "int",
    url: "https://www.pf2.ru/ancestries/leshy",
  },
  orc: {
    id: "orc",
    name: "Орк",
    hp: 10,
    size: "medium",
    speed: 25,
    boosts: ["str", "free"],
    flaw: null,
    url: "https://www.pf2.ru/ancestries/orc",
  },
};

/** Происхождения (упрощённо: ключевые бусты и навык). */
export const BACKGROUNDS = {
  warrior: { id: "warrior", name: "Воин", boosts: ["str", "con"], skill: "athletics", url: "https://www.pf2.ru/backgrounds" },
  farmhand: { id: "farmhand", name: "Фермер", boosts: ["con", "wis"], skill: "athletics", url: "https://www.pf2.ru/backgrounds" },
  scholar: { id: "scholar", name: "Учёный", boosts: ["int", "wis"], skill: "arcana", url: "https://www.pf2.ru/backgrounds" },
  street_urchin: { id: "street_urchin", name: "Уличный бродяга", boosts: ["dex", "int"], skill: "thievery", url: "https://www.pf2.ru/backgrounds" },
  acolyte: { id: "acolyte", name: "Послушник", boosts: ["int", "wis"], skill: "religion", url: "https://www.pf2.ru/backgrounds" },
  artist: { id: "artist", name: "Художник", boosts: ["dex", "cha"], skill: "crafting", url: "https://www.pf2.ru/backgrounds" },
  hunter: { id: "hunter", name: "Охотник", boosts: ["dex", "wis"], skill: "survival", url: "https://www.pf2.ru/backgrounds" },
  noble: { id: "noble", name: "Аристократ", boosts: ["int", "cha"], skill: "society", url: "https://www.pf2.ru/backgrounds" },
  scout: { id: "scout", name: "Разведчик", boosts: ["dex", "wis"], skill: "stealth", url: "https://www.pf2.ru/backgrounds" },
  gladiator: { id: "gladiator", name: "Гладиатор", boosts: ["str", "cha"], skill: "performance", url: "https://www.pf2.ru/backgrounds" },
};

/**
 * Классы Player Core / распространённые.
 * hp — кости ОЗ за уровень; key — ключевая характеристика.
 */
export const CLASSES = {
  fighter: { id: "fighter", name: "Воин", hp: 10, key: "str", perception: "expert", fort: "expert", ref: "expert", will: "trained", url: "https://www.pf2.ru/classes/fighter" },
  ranger: { id: "ranger", name: "Следопыт", hp: 10, key: "dex", perception: "expert", fort: "expert", ref: "expert", will: "trained", url: "https://www.pf2.ru/classes/ranger" },
  rogue: { id: "rogue", name: "Плут", hp: 8, key: "dex", perception: "expert", fort: "trained", ref: "expert", will: "expert", url: "https://www.pf2.ru/classes/rogue" },
  barbarian: { id: "barbarian", name: "Варвар", hp: 12, key: "str", perception: "expert", fort: "expert", ref: "trained", will: "expert", url: "https://www.pf2.ru/classes/barbarian" },
  champion: { id: "champion", name: "Чемпион", hp: 10, key: "str", perception: "trained", fort: "expert", ref: "trained", will: "expert", url: "https://www.pf2.ru/classes/champion" },
  monk: { id: "monk", name: "Монах", hp: 10, key: "str", perception: "trained", fort: "expert", ref: "expert", will: "expert", url: "https://www.pf2.ru/classes/monk" },
  swashbuckler: { id: "swashbuckler", name: "Сорвиголова", hp: 10, key: "dex", perception: "expert", fort: "trained", ref: "expert", will: "expert", url: "https://www.pf2.ru/classes/swashbuckler" },
  wizard: { id: "wizard", name: "Волшебник", hp: 6, key: "int", perception: "trained", fort: "trained", ref: "trained", will: "expert", url: "https://www.pf2.ru/classes/wizard" },
  witch: { id: "witch", name: "Ведьма", hp: 6, key: "int", perception: "trained", fort: "trained", ref: "trained", will: "expert", url: "https://www.pf2.ru/classes/witch" },
  bard: { id: "bard", name: "Бард", hp: 8, key: "cha", perception: "expert", fort: "trained", ref: "trained", will: "expert", url: "https://www.pf2.ru/classes/bard" },
  cleric: { id: "cleric", name: "Жрец", hp: 8, key: "wis", perception: "trained", fort: "expert", ref: "trained", will: "expert", url: "https://www.pf2.ru/classes/cleric" },
  druid: { id: "druid", name: "Друид", hp: 8, key: "wis", perception: "trained", fort: "expert", ref: "trained", will: "expert", url: "https://www.pf2.ru/classes/druid" },
  oracle: { id: "oracle", name: "Оракул", hp: 8, key: "cha", perception: "trained", fort: "expert", ref: "trained", will: "expert", url: "https://www.pf2.ru/classes/oracle" },
  sorcerer: { id: "sorcerer", name: "Чародей", hp: 6, key: "cha", perception: "trained", fort: "trained", ref: "trained", will: "expert", url: "https://www.pf2.ru/classes/sorcerer" },
  magus: { id: "magus", name: "Магус", hp: 8, key: "str", perception: "trained", fort: "expert", ref: "trained", will: "expert", url: "https://www.pf2.ru/classes/magus" },
  alchemist: { id: "alchemist", name: "Алхимик", hp: 8, key: "int", perception: "trained", fort: "expert", ref: "expert", will: "trained", url: "https://www.pf2.ru/classes/alchemist" },
  investigator: { id: "investigator", name: "Следователь", hp: 8, key: "int", perception: "expert", fort: "trained", ref: "expert", will: "expert", url: "https://www.pf2.ru/classes/investigator" },
  inventor: { id: "inventor", name: "Изобретатель", hp: 8, key: "int", perception: "trained", fort: "expert", ref: "trained", will: "expert", url: "https://www.pf2.ru/classes/inventor" },
};

/** Навыки Pathfinder 2e (Player Core). */
export const SKILLS = [
  { id: "acrobatics", name: "Акробатика", ability: "dex" },
  { id: "arcana", name: "Аркана", ability: "int" },
  { id: "athletics", name: "Атлетика", ability: "str" },
  { id: "crafting", name: "Ремесло", ability: "int" },
  { id: "deception", name: "Обман", ability: "cha" },
  { id: "diplomacy", name: "Дипломатия", ability: "cha" },
  { id: "intimidation", name: "Запугивание", ability: "cha" },
  { id: "medicine", name: "Медицина", ability: "wis" },
  { id: "nature", name: "Природа", ability: "wis" },
  { id: "occultism", name: "Оккультизм", ability: "int" },
  { id: "performance", name: "Выступление", ability: "cha" },
  { id: "religion", name: "Религия", ability: "wis" },
  { id: "society", name: "Общество", ability: "int" },
  { id: "stealth", name: "Скрытность", ability: "dex" },
  { id: "survival", name: "Выживание", ability: "wis" },
  { id: "thievery", name: "Воровство", ability: "dex" },
];

export const PROF_RANKS = [
  { id: "untrained", name: "Необуч.", short: "—", bonus: 0, step: 0 },
  { id: "trained", name: "Обучен", short: "О", bonus: 2, step: 1 },
  { id: "expert", name: "Эксперт", short: "Э", bonus: 4, step: 2 },
  { id: "master", name: "Мастер", short: "М", bonus: 6, step: 3 },
  { id: "legendary", name: "Легенда", short: "Л", bonus: 8, step: 4 },
];

/**
 * Упрощённый список черт 1–го уровня (общие / боевые / навыки).
 * Полный перечень — на pf2.ru.
 */
export const FEATS = [
  { id: "toughness", name: "Крепость", type: "general", level: 1, desc: "+1 ОЗ за уровень" },
  { id: "fleet", name: "Быстрый", type: "general", level: 1, desc: "+5 футов к скорости" },
  { id: "diehard", name: "Живучий", type: "general", level: 1, desc: "Умираете на −макс.ОЗ, не −0" },
  { id: "shield_block", name: "Блок щитом", type: "general", level: 1, desc: "Реакция: снизить урон щитом" },
  { id: "armor_prof", name: "Лёгкая броня", type: "general", level: 1, desc: "Владение лёгкой бронёй" },
  { id: "weapon_prof", name: "Боевое оружие", type: "general", level: 1, desc: "Владение боевым оружием" },
  { id: "battle_medicine", name: "Полевая медицина", type: "skill", level: 1, desc: "Лечить в бою (Медицина)" },
  { id: "assurance", name: "Уверенность", type: "skill", level: 1, desc: "Фиксированный результат навыка" },
  { id: "quick_repair", name: "Быстрый ремонт", type: "skill", level: 1, desc: "Чинить за 1 действие" },
  { id: "incredible_initiative", name: "Невероятная инициатива", type: "general", level: 1, desc: "+2 к инициативе" },
  { id: "power_attack", name: "Мощная атака", type: "class", level: 1, desc: "Два действия: больше урона" },
  { id: "sudden_charge", name: "Внезапный натиск", type: "class", level: 1, desc: "Два шага + удар" },
  { id: "point_blank_shot", name: "Выстрел в упор", type: "class", level: 1, desc: "Лучше стрельба вблизи" },
  { id: "twin_takedown", name: "Двойной удар", type: "class", level: 1, desc: "Два удара одним действием" },
  { id: "nims", name: "Увёртливый", type: "general", level: 1, desc: "+1 к Реакции при уклонении" },
  { id: "charming_liar", name: "Обаятельный лжец", type: "skill", level: 1, desc: "Быстрый обман" },
  { id: "group_impression", name: "Групповое впечатление", type: "skill", level: 1, desc: "Дипломатия на группу" },
  { id: "natural_medicine", name: "Народная медицина", type: "skill", level: 1, desc: "Лечить через Природу" },
  { id: "terrain_stalker", name: "Скрытный следопыт", type: "skill", level: 1, desc: "Скрытность на местности" },
  { id: "additional_lore", name: "Доп. знание", type: "skill", level: 1, desc: "Ещё один навык Знания" },
];

export const CREATURE_TYPES = [
  { id: "animal", name: "Животное" },
  { id: "beast", name: "Зверь" },
  { id: "construct", name: "Конструкт" },
  { id: "dragon", name: "Дракон" },
  { id: "elemental", name: "Элементаль" },
  { id: "fey", name: "Фея" },
  { id: "fiend", name: "Исчадие" },
  { id: "giant", name: "Великан" },
  { id: "humanoid", name: "Гуманоид" },
  { id: "monitor", name: "Страж" },
  { id: "ooze", name: "Слизь" },
  { id: "plant", name: "Растение" },
  { id: "spirit", name: "Дух" },
  { id: "undead", name: "Нежить" },
  { id: "aberration", name: "Аберрация" },
];

/**
 * Базовые значения для создания существ (умеренные), по таблице GM Core.
 * Упрощённая сводка для редактора врагов.
 */
export const CREATURE_BASELINES = {
  "-1": { ac: 15, hp: 8, perception: 5, fort: 6, ref: 6, will: 2, attack: 8, damage: "1d4+2", spellDc: 14 },
  0: { ac: 16, hp: 15, perception: 6, fort: 7, ref: 7, will: 3, attack: 9, damage: "1d6+2", spellDc: 15 },
  1: { ac: 16, hp: 20, perception: 7, fort: 8, ref: 8, will: 4, attack: 10, damage: "1d8+4", spellDc: 16 },
  2: { ac: 18, hp: 30, perception: 8, fort: 9, ref: 9, will: 5, attack: 12, damage: "1d10+5", spellDc: 17 },
  3: { ac: 19, hp: 45, perception: 10, fort: 11, ref: 10, will: 7, attack: 13, damage: "1d12+6", spellDc: 19 },
  4: { ac: 21, hp: 60, perception: 11, fort: 12, ref: 12, will: 8, attack: 15, damage: "2d8+6", spellDc: 20 },
  5: { ac: 22, hp: 75, perception: 12, fort: 13, ref: 13, will: 9, attack: 17, damage: "2d8+8", spellDc: 21 },
  6: { ac: 23, hp: 95, perception: 14, fort: 15, ref: 14, will: 11, attack: 18, damage: "2d10+8", spellDc: 22 },
  7: { ac: 25, hp: 115, perception: 15, fort: 16, ref: 15, will: 12, attack: 20, damage: "2d10+10", spellDc: 24 },
  8: { ac: 26, hp: 135, perception: 16, fort: 17, ref: 17, will: 13, attack: 21, damage: "2d12+10", spellDc: 25 },
  9: { ac: 27, hp: 155, perception: 17, fort: 18, ref: 18, will: 14, attack: 22, damage: "2d12+12", spellDc: 26 },
  10: { ac: 29, hp: 175, perception: 19, fort: 20, ref: 19, will: 16, attack: 24, damage: "3d10+12", spellDc: 28 },
  11: { ac: 30, hp: 195, perception: 20, fort: 21, ref: 20, will: 17, attack: 25, damage: "3d10+13", spellDc: 29 },
  12: { ac: 31, hp: 215, perception: 21, fort: 22, ref: 22, will: 18, attack: 27, damage: "3d12+13", spellDc: 30 },
  13: { ac: 32, hp: 235, perception: 22, fort: 23, ref: 23, will: 19, attack: 28, damage: "3d12+15", spellDc: 31 },
  14: { ac: 34, hp: 255, perception: 24, fort: 25, ref: 24, will: 21, attack: 30, damage: "4d10+15", spellDc: 33 },
  15: { ac: 35, hp: 275, perception: 25, fort: 26, ref: 25, will: 22, attack: 31, damage: "4d10+17", spellDc: 34 },
  16: { ac: 36, hp: 295, perception: 26, fort: 27, ref: 27, will: 23, attack: 32, damage: "4d12+17", spellDc: 35 },
  17: { ac: 37, hp: 315, perception: 27, fort: 28, ref: 28, will: 24, attack: 34, damage: "4d12+18", spellDc: 36 },
  18: { ac: 39, hp: 335, perception: 29, fort: 30, ref: 29, will: 26, attack: 35, damage: "5d10+18", spellDc: 38 },
  19: { ac: 40, hp: 355, perception: 30, fort: 31, ref: 30, will: 27, attack: 37, damage: "5d10+20", spellDc: 39 },
  20: { ac: 41, hp: 390, perception: 31, fort: 32, ref: 32, will: 28, attack: 38, damage: "5d12+20", spellDc: 40 },
};

const PROF_BONUS = {
  untrained: 0,
  trained: 2,
  expert: 4,
  master: 6,
  legendary: 8,
};

/**
 * @param {number} level
 * @param {'untrained'|'trained'|'expert'|'master'|'legendary'} rank
 */
export function proficiencyBonus(level, rank) {
  return level + (PROF_BONUS[rank] ?? 0);
}

/**
 * Модификатор навыка PF2e: характеристика + владение.
 * Необученный — только модификатор характеристики (без уровня).
 * @param {object} opts
 * @param {number} opts.level
 * @param {number} opts.abilityMod
 * @param {string} [opts.rank]
 */
export function calcSkillModifier({ level, abilityMod, rank = "untrained" }) {
  const abl = Number(abilityMod) || 0;
  if (rank === "untrained") return abl;
  return abl + proficiencyBonus(Math.max(1, Number(level) || 1), /** @type {'trained'|'expert'|'master'|'legendary'} */ (rank));
}

/**
 * Примерные модификаторы характеристик 1 уровня после бустов.
 * @param {string} ancestryId
 * @param {string} backgroundId
 * @param {string} classId
 */
export function suggestAbilityMods(ancestryId, backgroundId, classId) {
  /** @type {Record<AbilityId, number>} */
  const mods = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  const ancestry = ANCESTRIES[ancestryId];
  const background = BACKGROUNDS[backgroundId];
  const cls = CLASSES[classId];

  const apply = (id, delta) => {
    if (!id || id === "free") return;
    if (mods[id] !== undefined) mods[id] += delta;
  };

  if (ancestry) {
    for (const b of ancestry.boosts) apply(b, 1);
    if (ancestry.flaw) apply(ancestry.flaw, -1);
  }
  if (background) {
    for (const b of background.boosts) apply(b, 1);
  }
  if (cls?.key) apply(cls.key, 1);

  // Свободные бусты народа → в ключевую характеристику класса, затем в Вын
  const freeCount = (ancestry?.boosts || []).filter((b) => b === "free").length;
  if (freeCount > 0 && cls?.key) apply(cls.key, 1);
  if (freeCount > 1) apply("con", 1);

  return mods;
}

/**
 * ОЗ по формуле PF2e: ОЗ народа + (ОЗ класса + Вын) × уровень
 * @param {object} opts
 */
export function calcPcHp({ ancestryId, classId, level, conMod }) {
  const ancestry = ANCESTRIES[ancestryId];
  const cls = CLASSES[classId];
  if (!ancestry || !cls) return 10;
  const lvl = Math.max(1, Math.min(20, Number(level) || 1));
  const con = Number(conMod) || 0;
  return ancestry.hp + (cls.hp + con) * lvl;
}

/**
 * Черновой КЗ: 10 + Лов + бонус владения бронёй (обучен) + уровень.
 * Пользователь может править вручную.
 */
export function calcPcAc({ level, dexMod }) {
  const lvl = Math.max(1, Math.min(20, Number(level) || 1));
  const dex = Number(dexMod) || 0;
  return 10 + dex + proficiencyBonus(lvl, "trained");
}

/**
 * @param {object} opts
 */
export function calcPcSaves({ classId, level, conMod, dexMod, wisMod }) {
  const cls = CLASSES[classId];
  const lvl = Math.max(1, Math.min(20, Number(level) || 1));
  if (!cls) return { fort: 0, ref: 0, will: 0, perception: 0 };
  return {
    fort: proficiencyBonus(lvl, cls.fort) + (Number(conMod) || 0),
    ref: proficiencyBonus(lvl, cls.ref) + (Number(dexMod) || 0),
    will: proficiencyBonus(lvl, cls.will) + (Number(wisMod) || 0),
    perception: proficiencyBonus(lvl, cls.perception) + (Number(wisMod) || 0),
  };
}

/**
 * @param {number|string} level
 */
export function getCreatureBaseline(level) {
  const n = Number(level);
  const key = String(Math.max(-1, Math.min(20, Number.isFinite(n) ? n : 1)));
  return CREATURE_BASELINES[key] || CREATURE_BASELINES["1"];
}

export function formatMod(n) {
  const v = Number(n) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
}
