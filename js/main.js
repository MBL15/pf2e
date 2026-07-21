import { generateDungeon, isCellWalkable, canPlaceObstacle, findRoomAt, getStartSpawnCells, computeVisibleCells, getRoomConnectionDoors, THEMES, OBSTACLE_TYPES, ROOM_SHAPE_LABELS } from "./generator.js";
import { renderMap, computePanToCenterOnCell, renderObstaclePreview } from "./renderer.js";
import {
  hydrateCharacters,
  readLegacyCharacters,
  saveCharacters,
  makeCharacter,
  recalculateCharacter,
} from "./characters.js";
import {
  hydrateEnemies,
  readLegacyEnemies,
  saveEnemies,
  makeEnemy,
  recalculateEnemy,
} from "./enemies.js";
import {
  hydrateAccounts,
  readLegacyAccounts,
  loadAccounts,
  createAccount,
  loginAsAccount,
  canEditCharacter,
  canCreateCharacter,
  canDeleteCharacter,
  canManageEnemies,
  canRegenerateMap,
  canSwitchMapRole,
  unlinkCharacterFromAccounts,
  accountNeedsPin,
  isMaster,
  isPlayer,
} from "./accounts.js";
import { pingApi, fetchState, putState, putMap, fetchMe } from "./api.js";
import {
  loadBestiary,
  filterBestiary,
  bestiaryToEnemy,
  pf2Url,
  aonUrl,
  formatMod as formatBestiaryMod,
} from "./bestiary.js";
import {
  ANCESTRIES,
  BACKGROUNDS,
  CLASSES,
  CREATURE_TYPES,
  SIZES,
  ABILITIES,
  SKILLS,
  FEATS,
  suggestAbilityMods,
  formatMod,
} from "./pf2e-data.js";

const MAP_STORAGE_KEY = "glubiny-map-v1";

/** @type {ReturnType<typeof generateDungeon> | null} */
let dungeon = null;
/** @type {'top'|'iso'} */
let view = "top";
/** @type {number} */
let isoRotation = 0;
/** @type {number} */
let mapZoom = 1;
/** @type {number} */
let mapPanX = 0;
/** @type {number} */
let mapPanY = 0;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 5;
const ZOOM_STEP = 1.25;
const SELECT_ZOOM = 2.05;
/** @type {import('./generator.js').SettingId} */
let setting = "forest";
/** @type {import('./characters.js').Character[]} */
let characters = [];
/** @type {import('./enemies.js').Enemy[]} */
let enemies = [];
/** @type {import('./accounts.js').Account[]} */
let accounts = [];
/** @type {import('./accounts.js').Account | null} */
let currentAccount = null;
/** @type {import('./characters.js').TokenPlacement[]} */
let tokens = [];
/** @type {{ type: 'pc'|'enemy', id: string } | null} */
let selectedActor = null;
/** @type {string | null} */
let editingCharId = null;
/** @type {string | null} */
let editingEnemyId = null;
/** @type {number | null} */
let selectedRoomId = null;
/** @type {number | null} */
let openedRoomId = null;
/** @type {'token' | 'obstacle'} */
let editTool = "token";
/** @type {Record<string, number>} */
let obstacleVariants = {};
/** @type {Record<string, boolean>} ключ "x,y" → дверь открыта */
let doorStates = {};
/** @type {number} */
let selectedObstacleVariant = 0;
/** @type {'map'|'rooms'|'party'} */
let panelTabBeforeObstacles = "party";
/** @type {'master' | 'player'} */
let mapRole = "master";
/** @type {Set<number>} */
let visitedRoomIds = new Set();
/** Комнаты, куда мастер разрешил вход игрокам */
/** @type {Set<number>} */
let unlockedRoomIds = new Set();
/** @type {ReturnType<typeof renderMap>} */
let hitMap = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let toastTimer = null;
/** @type {boolean} */
let mapPanning = false;
/** @type {boolean} */
let mapDidPan = false;
/** @type {number} */
let panLastX = 0;
/** @type {number} */
let panLastY = 0;

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("mapCanvas"));
const canvasWrap = document.getElementById("canvasWrap");
const zoomLabelBtn = document.getElementById("btnZoomReset");
const stageHint = document.getElementById("stageHint");
const legend = document.getElementById("legend");
const charList = document.getElementById("charList");
const enemyList = document.getElementById("enemyList");
const roomList = document.getElementById("roomList");
const roomBanner = document.getElementById("roomBanner");
const editTools = document.getElementById("editTools");
const panelObstacles = document.getElementById("panelObstacles");
const obstaclePicker = document.getElementById("obstaclePicker");
const obstacleRoomName = document.getElementById("obstacleRoomName");
const roomPickHint = document.getElementById("roomPickHint");
const statusText = document.getElementById("statusText");
const mapSeedOut = document.getElementById("mapSeedOut");
const statusSeed = document.getElementById("statusSeed");
const statusSeedValue = document.getElementById("statusSeedValue");
const roomTabCount = document.getElementById("roomTabCount");
const heroTabCount = document.getElementById("heroTabCount");
const enemyTabCount = document.getElementById("enemyTabCount");
const toastEl = document.getElementById("toast");
const helpDialog = /** @type {HTMLDialogElement} */ (document.getElementById("helpDialog"));
const accountDialog = /** @type {HTMLDialogElement} */ (document.getElementById("accountDialog"));
const accountPinDialog = /** @type {HTMLDialogElement} */ (document.getElementById("accountPinDialog"));
const accountList = document.getElementById("accountList");
const accountSessionNote = document.getElementById("accountSessionNote");
const accountChipName = document.getElementById("accountChipName");
const accountChipRole = document.getElementById("accountChipRole");
const accountCreateForm = /** @type {HTMLFormElement} */ (document.getElementById("accountCreateForm"));
const accountRoleSelect = /** @type {HTMLSelectElement} */ (document.getElementById("accountRole"));
const accountCharField = document.getElementById("accountCharField");
const accountCharacterSelect = /** @type {HTMLSelectElement} */ (document.getElementById("accountCharacter"));
const accountPinForm = /** @type {HTMLFormElement} */ (document.getElementById("accountPinForm"));
const accountPinInput = /** @type {HTMLInputElement} */ (document.getElementById("accountPinInput"));
const accountPinLabel = document.getElementById("accountPinLabel");
const btnCloseRoom = /** @type {HTMLButtonElement} */ (document.getElementById("btnCloseRoom"));
const btnToolbarBack = /** @type {HTMLButtonElement} */ (document.getElementById("btnToolbarBack"));
const charDialog = /** @type {HTMLDialogElement} */ (document.getElementById("charDialog"));
const charForm = /** @type {HTMLFormElement} */ (document.getElementById("charForm"));
const btnDeleteChar = /** @type {HTMLButtonElement} */ (document.getElementById("btnDeleteChar"));
const enemyDialog = /** @type {HTMLDialogElement} */ (document.getElementById("enemyDialog"));
const enemyForm = /** @type {HTMLFormElement} */ (document.getElementById("enemyForm"));
const btnDeleteEnemy = /** @type {HTMLButtonElement} */ (document.getElementById("btnDeleteEnemy"));
const bestiaryDialog = /** @type {HTMLDialogElement} */ (document.getElementById("bestiaryDialog"));
const bestiaryList = document.getElementById("bestiaryList");
const bestiaryDetail = document.getElementById("bestiaryDetail");
const bestiaryStatus = document.getElementById("bestiaryStatus");
const bestiaryQuery = /** @type {HTMLInputElement} */ (document.getElementById("bestiaryQuery"));
const bestiaryType = /** @type {HTMLSelectElement} */ (document.getElementById("bestiaryType"));
const bestiaryLevelMin = /** @type {HTMLInputElement} */ (document.getElementById("bestiaryLevelMin"));
const bestiaryLevelMax = /** @type {HTMLInputElement} */ (document.getElementById("bestiaryLevelMax"));
const isoRotate = document.getElementById("isoRotate");
const isoAngleLabel = document.getElementById("isoAngleLabel");

/** @type {import('./bestiary.js').BestiaryEntry[]} */
let bestiaryData = [];
/** @type {import('./bestiary.js').BestiaryEntry | null} */
let selectedBestiaryEntry = null;

const roomCount = /** @type {HTMLInputElement} */ (document.getElementById("roomCount"));
const roomSize = /** @type {HTMLInputElement} */ (document.getElementById("roomSize"));
const roomCountOut = document.getElementById("roomCountOut");
const roomSizeOut = document.getElementById("roomSizeOut");

fillSelect("charAncestry", Object.values(ANCESTRIES).map((a) => [a.id, a.name]));
fillSelect("charBackground", Object.values(BACKGROUNDS).map((b) => [b.id, b.name]));
fillSelect("charClass", Object.values(CLASSES).map((c) => [c.id, c.name]));
fillSelect("enemyType", CREATURE_TYPES.map((t) => [t.id, t.name]));
fillSelect("enemySize", SIZES.map((s) => [s.id, s.name]));
fillSelect(
  "bestiaryType",
  [["", "Все"], ...CREATURE_TYPES.map((t) => [t.id, t.name])]
);
buildAbilityInputs();
buildFeatList();
buildSkillList();

/** @type {string[]} */
let draftFeats = [];
/** @type {Record<string, number>} */
let draftSkills = {};
/** @type {string} */
let draftPortrait = "";
/** @type {string | null} */
let pendingPinAccountId = null;
/** @type {boolean} */
let charViewOnly = false;

const PORTRAIT_SYMBOLS = ["⚔", "✦", "🛡", "🏹", "🔮", "🗡", "⚜", "★"];

function fillSelect(id, options) {
  const el = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
  if (!el) return;
  el.innerHTML = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
}

function buildAbilityInputs() {
  const wrap = document.getElementById("charAbilities");
  if (!wrap) return;
  wrap.innerHTML = ABILITIES.map(
    (a) => `
    <div class="adv-stat-row ability-row" data-ability-row="${a.id}">
      <span class="adv-stat-name">${a.name}</span>
      <div class="adv-stepper">
        <button type="button" class="adv-step" data-ability-dec="${a.id}" aria-label="−">−</button>
        <input type="number" data-ability="${a.id}" min="-5" max="10" value="0" />
        <button type="button" class="adv-step" data-ability-inc="${a.id}" aria-label="+">+</button>
      </div>
    </div>`
  ).join("");

  wrap.querySelectorAll("[data-ability-dec]").forEach((btn) => {
    btn.addEventListener("click", () => nudgeAbility(/** @type {HTMLElement} */ (btn).dataset.abilityDec || "str", -1));
  });
  wrap.querySelectorAll("[data-ability-inc]").forEach((btn) => {
    btn.addEventListener("click", () => nudgeAbility(/** @type {HTMLElement} */ (btn).dataset.abilityInc || "str", 1));
  });
  wrap.querySelectorAll("[data-ability]").forEach((input) => {
    input.addEventListener("change", () => {
      refreshAbilityHighlights();
      updateAdvClassLine();
      renderSkillRanks();
    });
  });
}

/**
 * @param {string} id
 * @param {number} delta
 */
function nudgeAbility(id, delta) {
  const input = /** @type {HTMLInputElement | null} */ (
    document.querySelector(`#charAbilities [data-ability="${id}"]`)
  );
  if (!input) return;
  const next = Math.max(-5, Math.min(10, (Number(input.value) || 0) + delta));
  input.value = String(next);
  refreshAbilityHighlights();
  updateAdvClassLine();
  renderSkillRanks();
}

function refreshAbilityHighlights() {
  const mods = readAbilities();
  document.querySelectorAll("#charAbilities [data-ability-row]").forEach((row) => {
    const id = /** @type {HTMLElement} */ (row).dataset.abilityRow || "";
    const val = mods[id] ?? 0;
    row.classList.toggle("is-boosted", val > 0);
    row.classList.toggle("is-flawed", val < 0);
  });
}

function buildFeatList() {
  const wrap = document.getElementById("charFeatList");
  if (!wrap) return;
  wrap.innerHTML = FEATS.map(
    (f) => `
    <label class="adv-feat-item">
      <input type="checkbox" data-feat="${f.id}" />
      <span class="adv-feat-body">
        <strong>${f.name}</strong>
        <small>${f.desc}</small>
      </span>
      <span class="adv-feat-tag">${f.type === "class" ? "класс" : f.type === "skill" ? "навык" : "общ."}</span>
    </label>`
  ).join("");
  wrap.querySelectorAll("[data-feat]").forEach((cb) => {
    cb.addEventListener("change", () => {
      draftFeats = [...document.querySelectorAll("#charFeatList [data-feat]:checked")].map(
        (el) => /** @type {HTMLInputElement} */ (el).dataset.feat || ""
      );
      const count = document.getElementById("advFeatCount");
      if (count) count.textContent = String(draftFeats.length);
    });
  });
}

function buildSkillList() {
  const wrap = document.getElementById("charSkillList");
  if (!wrap) return;
  wrap.innerHTML = SKILLS.map(
    (s) => `
    <div class="adv-stat-row skill-row" data-skill-row="${s.id}">
      <span class="adv-stat-name">${s.name}</span>
      <div class="adv-stepper">
        <button type="button" class="adv-step" data-skill-dec="${s.id}" aria-label="−">−</button>
        <input type="number" data-skill="${s.id}" min="0" max="20" value="0" />
        <button type="button" class="adv-step" data-skill-inc="${s.id}" aria-label="+">+</button>
      </div>
    </div>`
  ).join("");
  wrap.querySelectorAll("[data-skill-dec]").forEach((btn) => {
    btn.addEventListener("click", () => nudgeSkill(/** @type {HTMLElement} */ (btn).dataset.skillDec || "", -1));
  });
  wrap.querySelectorAll("[data-skill-inc]").forEach((btn) => {
    btn.addEventListener("click", () => nudgeSkill(/** @type {HTMLElement} */ (btn).dataset.skillInc || "", 1));
  });
  wrap.querySelectorAll("[data-skill]").forEach((input) => {
    input.addEventListener("change", () => {
      const id = /** @type {HTMLInputElement} */ (input).dataset.skill || "";
      const n = Number(/** @type {HTMLInputElement} */ (input).value);
      draftSkills[id] = Number.isFinite(n) ? Math.max(0, Math.min(20, Math.round(n))) : 0;
      renderSkillRanks();
    });
  });
}

/**
 * @param {string} id
 * @param {number} delta
 */
function nudgeSkill(id, delta) {
  const input = /** @type {HTMLInputElement | null} */ (
    document.querySelector(`#charSkillList [data-skill="${id}"]`)
  );
  if (!input) return;
  const next = Math.max(0, Math.min(20, (Number(input.value) || 0) + delta));
  input.value = String(next);
  draftSkills[id] = next;
  renderSkillRanks();
}

function renderSkillRanks() {
  for (const s of SKILLS) {
    const value = Math.max(0, Math.min(20, Number(draftSkills[s.id]) || 0));
    draftSkills[s.id] = value;
    const input = /** @type {HTMLInputElement | null} */ (
      document.querySelector(`#charSkillList [data-skill="${s.id}"]`)
    );
    const row = document.querySelector(`#charSkillList [data-skill-row="${s.id}"]`);
    if (input && input.value !== String(value)) input.value = String(value);
    row?.classList.toggle("is-trained", value > 0);
  }
}

function setAdvTab(id) {
  document.querySelectorAll(".adv-tab, .profile-tab").forEach((btn) => {
    const active = /** @type {HTMLElement} */ (btn).dataset.advTab === id;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  const panes = {
    attrs: document.getElementById("advPaneAttrs"),
    feats: document.getElementById("advPaneFeats"),
    combat: document.getElementById("advPaneCombat"),
    skills: document.getElementById("advPaneSkills"),
  };
  for (const [key, el] of Object.entries(panes)) {
    if (!el) continue;
    const active = key === id;
    el.classList.toggle("is-active", active);
    el.hidden = !active;
  }
}

function updateAdvClassLine() {
  const line = document.getElementById("advClassLine");
  if (!line) return;
  const ancestry = ANCESTRIES[/** @type {HTMLSelectElement} */ (document.getElementById("charAncestry"))?.value]?.name || "—";
  const cls = CLASSES[/** @type {HTMLSelectElement} */ (document.getElementById("charClass"))?.value]?.name || "—";
  const level = /** @type {HTMLInputElement} */ (document.getElementById("charLevel"))?.value || "1";
  const name = /** @type {HTMLInputElement} */ (document.getElementById("charName"))?.value?.trim();
  line.textContent = `${ancestry} · ${cls} · Ур. ${level}`;
  if (name) {
    // keep subtitle as ancestry/class
  }
}

function updatePortraitUi() {
  const img = /** @type {HTMLImageElement | null} */ (document.getElementById("charPortraitImg"));
  const fallback = document.getElementById("charPortraitFallback");
  const clearBtn = document.getElementById("btnClearPortrait");
  const symbolEl = document.getElementById("charPortraitSymbol");
  const symbol = /** @type {HTMLSelectElement} */ (document.getElementById("charSymbol"))?.value || "⚔";
  const color = /** @type {HTMLInputElement} */ (document.getElementById("charColor"))?.value || "#0f6b5c";
  if (symbolEl) symbolEl.textContent = symbol;
  if (fallback) /** @type {HTMLElement} */ (fallback).style.background = color;

  if (draftPortrait && img) {
    img.src = draftPortrait;
    img.hidden = false;
    if (fallback) fallback.hidden = true;
    if (clearBtn) clearBtn.hidden = false;
  } else {
    if (img) {
      img.removeAttribute("src");
      img.hidden = true;
    }
    if (fallback) fallback.hidden = false;
    if (clearBtn) clearBtn.hidden = true;
  }
}

/**
 * @param {File} file
 */
function loadPortraitFile(file) {
  if (!file.type.startsWith("image/")) {
    showToast("Нужен файл изображения");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const raw = String(reader.result || "");
    resizePortrait(raw).then((dataUrl) => {
      draftPortrait = dataUrl;
      updatePortraitUi();
      showToast("Фото загружено");
    });
  };
  reader.readAsDataURL(file);
}

/**
 * @param {string} dataUrl
 * @returns {Promise<string>}
 */
function resizePortrait(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const max = 420;
      let { width, height } = img;
      if (width > max || height > max) {
        const scale = Math.min(max / width, max / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function syncOutputs() {
  if (roomCountOut) roomCountOut.textContent = roomCount.value;
  if (roomSizeOut) roomSizeOut.textContent = roomSize.value;
}

roomCount.addEventListener("input", syncOutputs);
roomSize.addEventListener("input", syncOutputs);
syncOutputs();

document.querySelectorAll(".setting-card").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!canRegenerateMap(currentAccount)) {
      showToast("Сетинг карты меняет только мастер");
      return;
    }
    document.querySelectorAll(".setting-card").forEach((b) => {
      b.classList.remove("is-active");
      b.setAttribute("aria-pressed", "false");
    });
    btn.classList.add("is-active");
    btn.setAttribute("aria-pressed", "true");
    setting = /** @type {import('./generator.js').SettingId} */ (btn.getAttribute("data-setting") || "forest");
    setStatus(`Сетинг: ${THEMES[setting].name}. Нажмите «Перегенерировать карту».`);
  });
});

document.querySelectorAll(".view-btn").forEach((btn) => {
  if (!btn.hasAttribute("data-view")) return;
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-btn[data-view]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    view = /** @type {'top'|'iso'} */ (btn.getAttribute("data-view") || "top");
    updateIsoRotateUi();
    redraw();
    showToast(view === "iso" ? "Изометрический вид" : "Вид сверху");
  });
});

document.querySelectorAll(".view-btn[data-role]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!canSwitchMapRole(currentAccount)) {
      showToast("Смена вида карты — только у мастера");
      return;
    }
    const role = /** @type {'master'|'player'} */ (btn.getAttribute("data-role") || "master");
    setMapRole(role);
  });
});

document.getElementById("btnRotateLeft")?.addEventListener("click", () => rotateIso(-1));
document.getElementById("btnRotateRight")?.addEventListener("click", () => rotateIso(1));

document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => {
    setEditTool(/** @type {'token' | 'obstacle'} */ (btn.getAttribute("data-tool") || "token"));
  });
});

/**
 * @param {'master'|'player'} role
 * @param {boolean} [announce]
 */
function setMapRole(role, announce = true) {
  mapRole = role;
  document.querySelectorAll(".view-btn[data-role]").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-role") === role);
  });
  redraw();
  if (announce) {
    showToast(role === "master" ? "Режим мастера — вся карта" : "Режим игрока — туман войны");
    setStatus(
      role === "master"
        ? "Мастер: видна вся карта."
        : "Игрок: видны посещённые комнаты и 1 клетка следующей."
    );
  }
}

/**
 * @param {number} id
 */
function markRoomVisited(id) {
  if (visitedRoomIds.has(id)) return false;
  visitedRoomIds.add(id);
  return true;
}

function resetVisitedRooms() {
  const startId = dungeon?.startRoomId ?? 0;
  visitedRoomIds = new Set([startId]);
  unlockedRoomIds = new Set([startId]);
}

/**
 * Игроки могут входить только в комнаты, разрешённые мастером.
 * @param {number} roomId
 */
function canEnterRoom(roomId) {
  if (isMaster(currentAccount)) return true;
  return unlockedRoomIds.has(roomId);
}

/**
 * @param {number} roomId
 * @param {boolean} [announce]
 */
function setRoomUnlocked(roomId, unlocked, announce = true) {
  if (!dungeon) return;
  const startId = dungeon.startRoomId ?? 0;
  if (roomId === startId && !unlocked) {
    showToast("Стартовую комнату нельзя закрыть");
    return;
  }
  if (unlocked) unlockedRoomIds.add(roomId);
  else unlockedRoomIds.delete(roomId);
  renderRoomList();
  redraw();
  void saveMapState();
  if (announce) {
    const room = dungeon.rooms.find((r) => r.id === roomId);
    const name = room?.name || `Комната ${roomId + 1}`;
    showToast(unlocked ? `Вход разрешён: ${name}` : `Вход закрыт: ${name}`);
  }
}

/**
 * @returns {Set<string> | null}
 */
function getPlayerVisibleCells() {
  if (mapRole !== "player" || !dungeon) return null;
  return computeVisibleCells(dungeon, visitedRoomIds);
}

/**
 * @param {number} x
 * @param {number} y
 */
function isCellVisibleToPlayer(x, y) {
  if (mapRole !== "player") return true;
  const cells = getPlayerVisibleCells();
  return !cells || cells.has(`${x},${y}`);
}
/**
 * Сохранить текущую карту, жетоны и вид в SQLite.
 * @returns {Promise<boolean>}
 */
async function saveMapState() {
  if (!dungeon) return false;
  try {
    const payload = {
      version: 1,
      dungeon: {
        width: dungeon.width,
        height: dungeon.height,
        grid: dungeon.grid,
        rooms: dungeon.rooms,
        setting: dungeon.setting,
        seed: dungeon.seed,
        startRoomId: dungeon.startRoomId,
        endRoomId: dungeon.endRoomId,
        links: dungeon.links,
      },
      tokens,
      setting,
      roomCount: roomCount.value,
      roomSize: roomSize.value,
      view,
      isoRotation,
      mapZoom,
      mapPanX,
      mapPanY,
      selectedRoomId,
      openedRoomId,
      editTool,
      obstacleVariants,
      doorStates,
      selectedObstacleVariant,
      mapRole,
      visitedRoomIds: [...visitedRoomIds],
      unlockedRoomIds: [...unlockedRoomIds],
    };
    await putMap(payload);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

/**
 * Восстановить карту из объекта (SQLite / legacy).
 * @param {any} data
 * @returns {boolean}
 */
function applyMapState(data) {
  try {
    if (!data?.dungeon?.grid || !Array.isArray(data.dungeon.rooms)) return false;

    const sid = /** @type {import('./generator.js').SettingId} */ (data.dungeon.setting || data.setting || "forest");
    dungeon = {
      ...data.dungeon,
      setting: sid,
      theme: THEMES[sid] || THEMES.forest,
    };
    tokens = Array.isArray(data.tokens) ? data.tokens : [];
    setting = sid;
    if (data.roomCount != null) roomCount.value = String(data.roomCount);
    if (data.roomSize != null) roomSize.value = String(data.roomSize);
    syncOutputs();
    applySettingUi(setting);

    view = data.view === "iso" ? "iso" : "top";
    document.querySelectorAll(".view-btn[data-view]").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-view") === view);
    });
    isoRotation = Number(data.isoRotation) || 0;
    mapZoom = Number(data.mapZoom) || 1;
    mapPanX = Number(data.mapPanX) || 0;
    mapPanY = Number(data.mapPanY) || 0;
    selectedRoomId = data.selectedRoomId ?? 0;
    openedRoomId = data.openedRoomId ?? null;
    setEditTool(data.editTool === "obstacle" ? "obstacle" : "token", false);
    obstacleVariants =
      data.obstacleVariants && typeof data.obstacleVariants === "object" ? { ...data.obstacleVariants } : {};
    doorStates = data.doorStates && typeof data.doorStates === "object" ? { ...data.doorStates } : {};
    selectedObstacleVariant = Number(data.selectedObstacleVariant) || 0;
    const savedVisited = Array.isArray(data.visitedRoomIds)
      ? data.visitedRoomIds.map(Number).filter((n) => Number.isFinite(n))
      : [dungeon.startRoomId ?? 0];
    visitedRoomIds = new Set(savedVisited.length ? savedVisited : [dungeon.startRoomId ?? 0]);
    for (const t of tokens) {
      const room = findRoomAt(dungeon.rooms, t.x, t.y);
      if (room) visitedRoomIds.add(room.id);
    }
    const startId = dungeon.startRoomId ?? 0;
    const savedUnlocked = Array.isArray(data.unlockedRoomIds)
      ? data.unlockedRoomIds.map(Number).filter((n) => Number.isFinite(n))
      : null;
    if (savedUnlocked?.length) {
      unlockedRoomIds = new Set(savedUnlocked);
    } else {
      // Старые сохранения: уже посещённые считаем разрешёнными
      unlockedRoomIds = new Set(visitedRoomIds);
    }
    unlockedRoomIds.add(startId);
    setMapRole(data.mapRole === "player" ? "player" : "master", false);
    if (openedRoomId != null && isMaster(currentAccount)) {
      openDoorsForRoom(openedRoomId);
    }
    updateIsoRotateUi();
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {boolean}
 */
function loadMapStateFromLegacy() {
  try {
    const raw = localStorage.getItem(MAP_STORAGE_KEY);
    if (!raw) return false;
    return applyMapState(JSON.parse(raw));
  } catch {
    return false;
  }
}

/**
 * @param {import('./generator.js').SettingId} id
 */
function applySettingUi(id) {
  document.querySelectorAll(".setting-card").forEach((b) => {
    const active = b.getAttribute("data-setting") === id;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

/**
 * @param {{ toast?: boolean, switchToRooms?: boolean }} [opts]
 */
function regenerateMap(opts = {}) {
  if (!canRegenerateMap(currentAccount)) {
    showToast("Перегенерация карты доступна только мастеру");
    return;
  }
  const { toast = true, switchToRooms = true } = opts;
  dungeon = generateDungeon({
    roomCount: Number(roomCount.value),
    roomSize: Number(roomSize.value),
    setting,
  });
  tokens = spawnPartyInStartRoom(dungeon);
  selectedRoomId = 0;
  openedRoomId = null;
  mapZoom = 1;
  mapPanX = 0;
  mapPanY = 0;
  resetVisitedRooms();
  obstacleVariants = {};
  doorStates = {};
  selectedObstacleVariant = 0;
  setEditTool("token", false);
  stageHint?.classList.add("is-hidden");
  updateLegend();
  updateSeedDisplay();
  if (switchToRooms) setPanelTab("rooms");
  redraw();
  if (toast) showToast(`Лабиринт с ответвлениями: ${dungeon.rooms.length} комнат`);
  setStatus("Карта перегенерирована. F5 — сохранить и обновить страницу.");
}

document.getElementById("btnGenerate")?.addEventListener("click", () => regenerateMap());
document.getElementById("btnRegenToolbar")?.addEventListener("click", () => regenerateMap());
document.getElementById("btnAccount")?.addEventListener("click", () => openAccountDialog());
document.getElementById("btnCloseAccountDialog")?.addEventListener("click", () => accountDialog?.close());
document.getElementById("btnCancelPin")?.addEventListener("click", () => {
  pendingPinAccountId = null;
  accountPinDialog?.close();
});

accountRoleSelect?.addEventListener("change", syncAccountCreateFields);
accountCreateForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = /** @type {HTMLInputElement} */ (document.getElementById("accountName")).value.trim();
  const role = /** @type {'master'|'player'} */ (accountRoleSelect.value || "player");
  const pin = /** @type {HTMLInputElement} */ (document.getElementById("accountPin")).value.trim();
  let characterId = accountCharacterSelect?.value || null;
  if (role === "player" && !characterId) {
    showToast("Выберите персонажа для игрока");
    return;
  }
  if (role === "master") characterId = null;
  try {
    const account = await createAccount({ name, role, characterId, pin });
    accounts = await loadAccounts();
    await loginAs(account.id, pin, true);
    accountCreateForm.reset();
    syncAccountCreateFields();
    accountDialog?.close();
  } catch {
    showToast("Не удалось создать аккаунт");
  }
});

accountPinForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pendingPinAccountId) return;
  const pin = accountPinInput?.value || "";
  const ok = await loginAs(pendingPinAccountId, pin, true);
  if (ok) {
    pendingPinAccountId = null;
    accountPinDialog?.close();
    accountDialog?.close();
  }
});
document.getElementById("btnCopySeed")?.addEventListener("click", async () => {
  const seed = dungeon?.seed;
  if (seed == null) {
    showToast("Нет сида — сначала сгенерируйте карту");
    return;
  }
  const text = String(seed);
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Сид скопирован: ${text}`);
  } catch {
    showToast(`Сид: ${text}`);
  }
});

function updateSeedDisplay() {
  const seed = dungeon?.seed;
  const label = seed == null ? "—" : String(seed);
  if (mapSeedOut) mapSeedOut.textContent = label;
  if (statusSeedValue) statusSeedValue.textContent = label;
  if (statusSeed) statusSeed.hidden = seed == null;
}document.getElementById("btnClearTokens")?.addEventListener("click", () => {
  if (tokens.length === 0) {
    showToast("На карте нет жетонов");
    return;
  }
  tokens = [];
  redraw();
  showToast("Жетоны убраны с карты");
});

btnCloseRoom.addEventListener("click", () => closeRoom());
btnToolbarBack.addEventListener("click", () => closeRoom());

document.getElementById("btnNewChar")?.addEventListener("click", () => {
  if (!canCreateCharacter(currentAccount)) {
    showToast("Создавать героев может только мастер");
    return;
  }
  setPanelTab("party");
  setPartyTab("heroes");
  openCharEditor(null);
});
document.getElementById("btnNewEnemy")?.addEventListener("click", () => {
  if (!canManageEnemies(currentAccount)) {
    showToast("Врагов редактирует только мастер");
    return;
  }
  setPanelTab("party");
  setPartyTab("enemies");
  openEnemyEditor(null);
});
document.getElementById("btnBestiary")?.addEventListener("click", () => {
  if (!canManageEnemies(currentAccount)) {
    showToast("Бестиарий доступен мастеру");
    return;
  }
  openBestiary();
});
document.getElementById("btnCloseBestiary")?.addEventListener("click", () => bestiaryDialog.close());
document.getElementById("btnHelp")?.addEventListener("click", () => helpDialog.showModal());
document.getElementById("btnCloseHelp")?.addEventListener("click", () => helpDialog.close());

document.querySelectorAll(".panel-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const panel = /** @type {HTMLElement} */ (btn).dataset.panel;
    if (panel) setPanelTab(panel);
  });
});

document.querySelectorAll(".party-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const party = /** @type {HTMLElement} */ (btn).dataset.party;
    if (party) setPartyTab(party);
  });
});

["input", "change"].forEach((evt) => {
  bestiaryQuery?.addEventListener(evt, () => renderBestiaryList());
  bestiaryType?.addEventListener(evt, () => renderBestiaryList());
  bestiaryLevelMin?.addEventListener(evt, () => renderBestiaryList());
  bestiaryLevelMax?.addEventListener(evt, () => renderBestiaryList());
});

document.getElementById("btnSuggestAbilities")?.addEventListener("click", () => {
  const ancestryId = /** @type {HTMLSelectElement} */ (document.getElementById("charAncestry")).value;
  const backgroundId = /** @type {HTMLSelectElement} */ (document.getElementById("charBackground")).value;
  const classId = /** @type {HTMLSelectElement} */ (document.getElementById("charClass")).value;
  const mods = suggestAbilityMods(ancestryId, backgroundId, classId);
  setAbilityInputs(mods);
  showToast("Бусты подставлены (свободные → ключ класса / Вын)");
});

document.querySelectorAll(".adv-tab, .profile-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = /** @type {HTMLElement} */ (btn).dataset.advTab;
    if (tab) setAdvTab(tab);
  });
});

document.getElementById("charPortraitFile")?.addEventListener("change", (e) => {
  const input = /** @type {HTMLInputElement} */ (e.target);
  const file = input.files?.[0];
  if (file) loadPortraitFile(file);
  input.value = "";
});

document.getElementById("btnClearPortrait")?.addEventListener("click", () => {
  draftPortrait = "";
  updatePortraitUi();
});

document.getElementById("btnPortraitPrev")?.addEventListener("click", () => cyclePortraitSymbol(-1));
document.getElementById("btnPortraitNext")?.addEventListener("click", () => cyclePortraitSymbol(1));

document.getElementById("charSymbol")?.addEventListener("change", updatePortraitUi);
document.getElementById("charColor")?.addEventListener("input", updatePortraitUi);
document.getElementById("charName")?.addEventListener("input", updateAdvClassLine);
document.getElementById("charLevel")?.addEventListener("input", () => {
  updateAdvClassLine();
  renderSkillRanks();
});

["charAncestry", "charBackground", "charClass"].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", () => {
    updateCharRefLinks();
    updateAdvClassLine();
  });
});

/**
 * @param {number} dir
 */
function cyclePortraitSymbol(dir) {
  const sel = /** @type {HTMLSelectElement} */ (document.getElementById("charSymbol"));
  if (!sel) return;
  const idx = PORTRAIT_SYMBOLS.indexOf(sel.value);
  const next = (idx < 0 ? 0 : idx + dir + PORTRAIT_SYMBOLS.length) % PORTRAIT_SYMBOLS.length;
  sel.value = PORTRAIT_SYMBOLS[next];
  updatePortraitUi();
}

document.getElementById("btnRecalcChar")?.addEventListener("click", () => {
  const draft = readCharForm(editingCharId);
  const calc = recalculateCharacter(draft);
  fillCharForm(calc);
  showToast("ОЗ, КЗ и спасброски пересчитаны");
});

document.getElementById("btnRecalcEnemy")?.addEventListener("click", () => {
  const draft = readEnemyForm(editingEnemyId);
  const calc = recalculateEnemy(draft);
  fillEnemyForm(calc);
  showToast(`Умеренные значения для уровня ${calc.level}`);
});

charForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (charViewOnly) {
    charDialog.close();
    return;
  }
  if (editingCharId) {
    if (!canEditCharacter(currentAccount, editingCharId)) {
      showToast("Нет прав редактировать этого героя");
      return;
    }
  } else if (!canCreateCharacter(currentAccount)) {
    showToast("Создавать героев может только мастер");
    return;
  }
  const payload = readCharForm(editingCharId);
  if (editingCharId) {
    const idx = characters.findIndex((c) => c.id === editingCharId);
    if (idx >= 0) characters[idx] = payload;
    showToast("Персонаж обновлён");
  } else {
    characters.push(payload);
    selectedActor = { type: "pc", id: payload.id };
    setPanelTab("party");
    setPartyTab("heroes");
    showToast(`${payload.name} в отряде`);
  }
  saveCharacters(characters);
  renderCharList();
  renderEnemyList();
  updateAccountUi();
  updateStatus();
  redraw();
  charDialog.close();
});

document.getElementById("btnCancelChar")?.addEventListener("click", () => charDialog.close());
document.getElementById("btnCancelCharFooter")?.addEventListener("click", () => charDialog.close());

btnDeleteChar.addEventListener("click", () => {
  if (!editingCharId) return;
  if (!canDeleteCharacter(currentAccount, editingCharId)) {
    showToast("Удалять героев может только мастер");
    return;
  }
  const removed = characters.find((c) => c.id === editingCharId);
  characters = characters.filter((c) => c.id !== editingCharId);
  tokens = tokens.filter((t) => !(t.actorType === "pc" && t.actorId === editingCharId));
  void unlinkCharacterFromAccounts(editingCharId).then(async () => {
    accounts = await loadAccounts();
    currentAccount = await fetchMe();
    updateAccountUi();
  });
  if (selectedActor?.type === "pc" && selectedActor.id === editingCharId) {
    selectedActor = characters[0] ? { type: "pc", id: characters[0].id } : enemies[0] ? { type: "enemy", id: enemies[0].id } : null;
  }
  saveCharacters(characters);
  renderCharList();
  renderEnemyList();
  redraw();
  charDialog.close();
  showToast(removed ? `${removed.name} удалён` : "Персонаж удалён");
});

enemyForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!canManageEnemies(currentAccount)) {
    showToast("Врагов редактирует только мастер");
    return;
  }
  const payload = readEnemyForm(editingEnemyId);
  if (editingEnemyId) {
    const idx = enemies.findIndex((en) => en.id === editingEnemyId);
    if (idx >= 0) enemies[idx] = payload;
    showToast("Враг обновлён");
  } else {
    enemies.push(payload);
    selectedActor = { type: "enemy", id: payload.id };
    setPanelTab("party");
    setPartyTab("enemies");
    showToast(`${payload.name} добавлен`);
  }
  saveEnemies(enemies);
  renderCharList();
  renderEnemyList();
  updateStatus();
  redraw();
  enemyDialog.close();
});

document.getElementById("btnCancelEnemy")?.addEventListener("click", () => enemyDialog.close());

btnDeleteEnemy.addEventListener("click", () => {
  if (!editingEnemyId) return;
  if (!canManageEnemies(currentAccount)) {
    showToast("Врагов удаляет только мастер");
    return;
  }
  const removed = enemies.find((en) => en.id === editingEnemyId);
  enemies = enemies.filter((en) => en.id !== editingEnemyId);
  tokens = tokens.filter((t) => !(t.actorType === "enemy" && t.actorId === editingEnemyId));
  if (selectedActor?.type === "enemy" && selectedActor.id === editingEnemyId) {
    selectedActor = enemies[0] ? { type: "enemy", id: enemies[0].id } : characters[0] ? { type: "pc", id: characters[0].id } : null;
  }
  saveEnemies(enemies);
  renderCharList();
  renderEnemyList();
  redraw();
  enemyDialog.close();
  showToast(removed ? `${removed.name} удалён` : "Враг удалён");
});

canvas.addEventListener("click", (e) => {
  if (mapDidPan) {
    mapDidPan = false;
    return;
  }
  if (!dungeon || !hitMap) return;
  const rect = canvas.getBoundingClientRect();
  const cell = hitMap.screenToCell(e.clientX - rect.left, e.clientY - rect.top);
  if (!cell) return;

  if (mapRole === "player" && !isCellVisibleToPlayer(cell.x, cell.y)) {
    showToast("Эта область ещё в тумане");
    return;
  }

  const cellType = dungeon.grid[cell.y]?.[cell.x];
  if (cellType === "door") {
    toggleDoor(cell.x, cell.y);
    return;
  }

  // Клик по жетону — выделить персонажа (им же ходят WASD)
  const tokenHere = findTokenAt(cell.x, cell.y);
  if (tokenHere && editTool !== "obstacle") {
    selectActor(tokenHere.actorType, tokenHere.actorId);
    return;
  }

  if (openedRoomId == null) {
    const room = findRoomAt(dungeon.rooms, cell.x, cell.y);
    if (room) {
      openRoom(room.id);
      return;
    }
    const type = dungeon.grid[cell.y]?.[cell.x];
    if (!type || !isCellWalkable(dungeon.grid, cell.x, cell.y, doorStates)) return;
    placeSelectedToken(cell.x, cell.y);
    return;
  }

  const room = dungeon.rooms.find((r) => r.id === openedRoomId);
  if (!room || !findRoomAt([room], cell.x, cell.y)) {
    showToast("Кликайте внутри комнаты");
    return;
  }

  const type = dungeon.grid[cell.y]?.[cell.x];
  if (!type) return;

  if (editTool === "obstacle") {
    toggleObstacle(cell.x, cell.y, type);
    return;
  }

  if (!isCellWalkable(dungeon.grid, cell.x, cell.y, doorStates)) {
    showToast("Сюда нельзя поставить жетон");
    return;
  }
  placeSelectedToken(cell.x, cell.y);
});

document.getElementById("btnZoomIn")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  zoomMap(ZOOM_STEP);
});
document.getElementById("btnZoomOut")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  zoomMap(1 / ZOOM_STEP);
});
document.getElementById("btnZoomReset")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  resetMapZoom();
});

function onMapWheel(e) {
  if (!dungeon) return;
  e.preventDefault();
  e.stopPropagation();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  zoomMap(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, mx, my);
}

canvas.addEventListener("wheel", onMapWheel, { passive: false });
canvasWrap?.addEventListener("wheel", onMapWheel, { passive: false });

const MAP_PAN_THRESHOLD = 4;

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.button !== 1) return;
  if (e.button === 1) e.preventDefault();
  mapPanning = true;
  mapDidPan = false;
  panLastX = e.clientX;
  panLastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (!mapPanning) return;
  const dx = e.clientX - panLastX;
  const dy = e.clientY - panLastY;
  if (!mapDidPan) {
    if (Math.abs(dx) + Math.abs(dy) < MAP_PAN_THRESHOLD) return;
    mapDidPan = true;
    canvas.classList.add("cursor-pan");
  }
  mapPanX += dx;
  mapPanY += dy;
  panLastX = e.clientX;
  panLastY = e.clientY;
  redraw();
});

function endMapPan(e) {
  if (!mapPanning) return;
  mapPanning = false;
  canvas.classList.remove("cursor-pan");
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  // click идёт сразу после pointerup — даём ему увидеть mapDidPan, затем сбрасываем
  if (mapDidPan) {
    setTimeout(() => {
      mapDidPan = false;
    }, 0);
  }
}

canvas.addEventListener("pointerup", endMapPan);
canvas.addEventListener("pointercancel", endMapPan);
canvas.addEventListener("auxclick", (e) => {
  if (e.button === 1) e.preventDefault();
});

// Блокируем автоскролл средней кнопкой
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 1) e.preventDefault();
});

window.addEventListener("keydown", (e) => {
  // F5: сохранить карту перед обновлением страницы
  if (e.key === "F5") {
    void saveMapState().then((ok) => {
      if (ok) showToast("Карта сохранена в SQLite");
    });
    return;
  }

  const tag = /** @type {HTMLElement} */ (e.target)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (/** @type {HTMLElement} */ (e.target)?.isContentEditable) return;

  const move = movementDeltaFromKey(e.key);
  if (move) {
    e.preventDefault();
    moveSelectedActor(move.dx, move.dy);
    return;
  }

  if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    clearActorSelection();
    return;
  }

  if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    zoomMap(ZOOM_STEP);
    return;
  }
  if (e.key === "-" || e.key === "_") {
    e.preventDefault();
    zoomMap(1 / ZOOM_STEP);
    return;
  }
  if (e.key === "0" && !e.ctrlKey && !e.metaKey) {
    resetMapZoom();
    return;
  }
  if (e.key === "Escape" && openedRoomId != null) {
    closeRoom();
    return;
  }
  if (view === "iso" && (e.key === "q" || e.key === "Q" || e.key === "[")) {
    rotateIso(-1);
    return;
  }
  if (view === "iso" && (e.key === "e" || e.key === "E" || e.key === "]")) {
    rotateIso(1);
    return;
  }
  if (openedRoomId == null) return;
  if (e.key === "1") setEditTool("token");
  if (e.key === "2") {
    if (!isMaster(currentAccount)) {
      showToast("Препятствия — только для мастера");
      return;
    }
    setEditTool("obstacle");
  }
});

window.addEventListener("pagehide", () => {
  void saveMapState();
});

/**
 * @param {string} key
 * @returns {{ dx: number, dy: number } | null}
 */
function movementDeltaFromKey(key) {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
    case "ц":
    case "Ц":
      return { dx: 0, dy: -1 };
    case "ArrowDown":
    case "s":
    case "S":
    case "ы":
    case "Ы":
      return { dx: 0, dy: 1 };
    case "ArrowLeft":
    case "a":
    case "A":
    case "ф":
    case "Ф":
      return { dx: -1, dy: 0 };
    case "ArrowRight":
    case "d":
    case "D":
    case "в":
    case "В":
      return { dx: 1, dy: 0 };
    default:
      return null;
  }
}

/**
 * Сдвиг выбранного жетона на одну клетку (стрелки / WASD).
 * @param {number} dx
 * @param {number} dy
 */
function moveSelectedActor(dx, dy) {
  if (!dungeon) return;
  if (!selectedActor) {
    showToast("Выберите авантюриста в отряде");
    return;
  }
  if (!canControlActor(selectedActor.type, selectedActor.id)) {
    showToast("Можно двигать только своего персонажа");
    return;
  }
  if (editTool === "obstacle" && openedRoomId != null) {
    showToast("Сейчас режим препятствий — переключите на «Жетоны»");
    return;
  }

  const idx = tokens.findIndex(
    (t) => t.actorType === selectedActor.type && t.actorId === selectedActor.id
  );
  if (idx < 0) {
    showToast(
      isPlayer(currentAccount)
        ? "Жетон ещё не на карте — попросите мастера поставить"
        : "Сначала поставьте жетон на карту кликом"
    );
    return;
  }

  const token = tokens[idx];
  const nx = token.x + dx;
  const ny = token.y + dy;
  const type = dungeon.grid[ny]?.[nx];
  if (!type || !isCellWalkable(dungeon.grid, nx, ny, doorStates)) return;

  if (mapRole === "player" && !isCellVisibleToPlayer(nx, ny)) return;

  const destRoom = findRoomAt(dungeon.rooms, nx, ny);
  if (destRoom && !canEnterRoom(destRoom.id)) {
    showToast("Мастер ещё не разрешил вход в эту комнату");
    return;
  }

  tokens[idx] = { ...token, x: nx, y: ny };

  const room = destRoom;
  if (room) {
    markRoomVisited(room.id);
    if (openedRoomId != null && openedRoomId !== room.id) {
      const prev = openedRoomId;
      selectedRoomId = room.id;
      openedRoomId = room.id;
      syncOpenedRoomDoors(prev, room.id);
    }
  } else if (openedRoomId != null) {
    // Вышли в коридор — общий вид карты
    openedRoomId = null;
    setEditTool("token", false);
  }

  redraw();
}
/**
 * @param {number} delta
 */
function rotateIso(delta) {
  if (view !== "iso") return;
  isoRotation = (((isoRotation + delta) % 4) + 4) % 4;
  updateIsoRotateUi();
  redraw();
  showToast(`Поворот: ${isoRotation * 90}°`);
}

function updateIsoRotateUi() {
  if (isoRotate) isoRotate.hidden = view !== "iso";
  if (isoAngleLabel) isoAngleLabel.textContent = `${isoRotation * 90}°`;
}

window.addEventListener("resize", () => redraw());

function tokenActors() {
  return [...characters, ...enemies];
}

/**
 * @param {number} x
 * @param {number} y
 */
function findTokenAt(x, y) {
  const onCell = tokens.filter((t) => t.x === x && t.y === y);
  if (!onCell.length) return null;
  // Если несколько на клетке — берём верхний (последний)
  return onCell[onCell.length - 1];
}

/**
 * @param {'pc'|'enemy'} type
 * @param {string} id
 */
function centerCameraOnActor(type, id) {
  if (!dungeon || type !== "pc") return;
  const token = tokens.find((t) => t.actorType === type && t.actorId === id);
  if (!token) return;

  if (openedRoomId != null) {
    const opened = dungeon.rooms.find((r) => r.id === openedRoomId);
    const insideOpened =
      opened &&
      token.x >= opened.x &&
      token.x < opened.x + opened.w &&
      token.y >= opened.y &&
      token.y < opened.y + opened.h;
    if (!insideOpened) {
      openedRoomId = null;
      setEditTool("token", false);
    }
  }

  const room = findRoomAt(dungeon.rooms, token.x, token.y);
  if (room) {
    selectedRoomId = room.id;
    markRoomVisited(room.id);
  }

  mapZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, SELECT_ZOOM));

  const pan = computePanToCenterOnCell(canvas, dungeon, view, {
    selectedRoomId,
    openedRoomId,
    isoRotation,
    zoom: mapZoom,
    panX: 0,
    panY: 0,
  }, token.x, token.y);

  if (pan) {
    mapPanX = pan.panX;
    mapPanY = pan.panY;
  }
}

/**
 * @param {'pc'|'enemy'} type
 * @param {string} id
 * @param {boolean} [announce]
 */
function selectActor(type, id, announce = true) {
  selectedActor = { type, id };
  centerCameraOnActor(type, id);
  renderCharList();
  renderEnemyList();
  updateStatus();
  updateCursor();
  redraw();
  if (!announce) return;
  const actor = tokenActors().find((a) => a.id === id);
  if (actor) showToast(`Выбран: ${actor.name}`);
}

function clearActorSelection() {
  if (!selectedActor) {
    showToast("Никто не выбран");
    return;
  }
  selectedActor = null;
  renderCharList();
  renderEnemyList();
  updateStatus();
  updateCursor();
  redraw();
  showToast("Выделение снято");
}

/**
 * @param {number} x
 * @param {number} y
 */
function placeSelectedToken(x, y) {
  if (isPlayer(currentAccount)) {
    showToast("Игроки ходят только стрелками или WASD");
    return;
  }
  if (!selectedActor) {
    showToast("Сначала выберите героя или врага");
    return;
  }
  if (!canControlActor(selectedActor.type, selectedActor.id)) {
    showToast("Можно ставить только своего персонажа");
    return;
  }
  const room = dungeon ? findRoomAt(dungeon.rooms, x, y) : null;
  if (room) markRoomVisited(room.id);
  const existingIdx = tokens.findIndex(
    (t) => t.actorType === selectedActor.type && t.actorId === selectedActor.id
  );
  const placement = { actorId: selectedActor.id, actorType: selectedActor.type, x, y };
  if (existingIdx >= 0) tokens[existingIdx] = placement;
  else tokens.push(placement);
  redraw();
  const actor = tokenActors().find((a) => a.id === selectedActor.id);
  if (actor) showToast(`${actor.name} на клетке ${x},${y}`);
}

/**
 * @param {number} x
 * @param {number} y
 * @param {string} type
 */
function toggleObstacle(x, y, type) {
  if (!isMaster(currentAccount)) {
    showToast("Препятствия ставит только мастер");
    return;
  }
  if (!dungeon || !canPlaceObstacle(type)) {
    showToast("Препятствие можно ставить только на пол");
    return;
  }
  const key = `${x},${y}`;
  if (type === "obstacle") {
    dungeon.grid[y][x] = "floor";
    delete obstacleVariants[key];
    showToast("Препятствие убрано");
  } else {
    dungeon.grid[y][x] = "obstacle";
    obstacleVariants[key] = selectedObstacleVariant;
    tokens = tokens.filter((t) => !(t.x === x && t.y === y));
    const types = OBSTACLE_TYPES[dungeon.setting] || OBSTACLE_TYPES.forest;
    const label = types[selectedObstacleVariant]?.label || "Препятствие";
    showToast(`${label} поставлено`);
  }
  redraw();
}

/**
 * @param {number} x
 * @param {number} y
 * @param {boolean} open
 */
function setDoorOpen(x, y, open) {
  const key = `${x},${y}`;
  if (open) doorStates[key] = true;
  else delete doorStates[key];
}

/**
 * @param {number} roomId
 */
function openDoorsForRoom(roomId) {
  if (!dungeon) return;
  for (const { x, y } of getRoomConnectionDoors(dungeon, roomId)) {
    setDoorOpen(x, y, true);
  }
}

/**
 * @param {number} roomId
 */
function closeDoorsForRoom(roomId) {
  if (!dungeon) return;
  for (const { x, y } of getRoomConnectionDoors(dungeon, roomId)) {
    setDoorOpen(x, y, false);
  }
}

/**
 * @param {number | null} prevRoomId
 * @param {number | null} nextRoomId
 */
function syncOpenedRoomDoors(prevRoomId, nextRoomId) {
  if (!isMaster(currentAccount) || !dungeon) return;
  if (prevRoomId != null && prevRoomId !== nextRoomId) {
    closeDoorsForRoom(prevRoomId);
  }
  if (nextRoomId != null) {
    openDoorsForRoom(nextRoomId);
  }
  void saveMapState();
}

/**
 * @param {number} x
 * @param {number} y
 */
function toggleDoor(x, y) {
  if (!dungeon || dungeon.grid[y]?.[x] !== "door") return;
  const key = `${x},${y}`;
  if (doorStates[key]) {
    delete doorStates[key];
    showToast("Дверь закрыта");
  } else {
    doorStates[key] = true;
    showToast("Дверь открыта");
  }
  void saveMapState();
  redraw();
}

/**
 * @returns {'map'|'rooms'|'party'}
 */
function getActivePanelTab() {
  const active = document.querySelector(".panel-tab.is-active");
  const panel = active ? /** @type {HTMLElement} */ (active).dataset.panel : null;
  if (panel === "map" || panel === "rooms" || panel === "party") return panel;
  return "party";
}

function renderObstaclePicker() {
  if (!obstaclePicker || !dungeon) return;
  const types = OBSTACLE_TYPES[dungeon.setting] || OBSTACLE_TYPES.forest;
  obstaclePicker.innerHTML = types
    .map(
      (t) => `
    <button type="button" class="obstacle-card${t.id === selectedObstacleVariant ? " is-active" : ""}" data-variant="${t.id}" aria-pressed="${t.id === selectedObstacleVariant}">
      <canvas width="56" height="56" aria-hidden="true"></canvas>
      <strong>${escapeHtml(t.label)}</strong>
    </button>`
    )
    .join("");

  obstaclePicker.querySelectorAll(".obstacle-card").forEach((btn) => {
    const variant = Number(/** @type {HTMLElement} */ (btn).dataset.variant) || 0;
    const preview = /** @type {HTMLCanvasElement | null} */ (btn.querySelector("canvas"));
    if (preview) renderObstaclePreview(preview, dungeon.setting, variant);
    btn.addEventListener("click", () => {
      selectedObstacleVariant = variant;
      renderObstaclePicker();
    });
  });
}

function showObstaclePanel() {
  panelTabBeforeObstacles = getActivePanelTab();
  for (const id of ["panelMap", "panelRooms", "panelParty"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.classList.remove("is-active");
    el.hidden = true;
  }
  document.querySelectorAll(".panel-tab").forEach((btn) => {
    btn.classList.remove("is-active");
    btn.setAttribute("aria-selected", "false");
  });
  if (panelObstacles) {
    panelObstacles.hidden = false;
    panelObstacles.classList.add("is-active");
  }
  if (obstacleRoomName && dungeon && openedRoomId != null) {
    const room = dungeon.rooms.find((r) => r.id === openedRoomId);
    obstacleRoomName.textContent = room
      ? `${room.name}: выберите тип и кликайте по полу на карте`
      : "Выберите тип и кликайте по полу на карте";
  }
  renderObstaclePicker();
}

function hideObstaclePanel() {
  if (!panelObstacles || panelObstacles.hidden) return;
  panelObstacles.hidden = true;
  panelObstacles.classList.remove("is-active");
  setPanelTab(panelTabBeforeObstacles || "party", true);
}

/**
 * @param {'token' | 'obstacle'} tool
 * @param {boolean} [announce]
 */
function setEditTool(tool, announce = true) {
  if (tool === "obstacle") {
    if (!isMaster(currentAccount)) {
      showToast("Препятствия — только для мастера");
      tool = "token";
    } else if (openedRoomId == null) {
      showToast("Сначала откройте комнату на карте");
      tool = "token";
    }
  }

  editTool = tool;
  document.querySelectorAll(".tool-btn[data-tool]").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-tool") === tool);
  });

  if (tool === "obstacle") showObstaclePanel();
  else {
    hideObstaclePanel();
    if (openedRoomId != null) setPanelTab("party");
  }

  updateCursor();
  updateStatus();
  updateRoomChrome();
  if (announce && openedRoomId != null) {
    showToast(tool === "obstacle" ? "Режим: препятствия" : "Режим: жетоны");
  }
}

/**
 * @param {number} id
 */
function openRoom(id) {
  if (!canEnterRoom(id)) {
    showToast("Мастер ещё не разрешил вход в эту комнату");
    return;
  }
  if (mapRole === "player" && !visitedRoomIds.has(id)) {
    // Разрешаем открыть только если видна хотя бы одна клетка комнаты (peek)
    const room = dungeon?.rooms.find((r) => r.id === id);
    if (!room) return;
    let peek = false;
    for (let y = room.y; y < room.y + room.h && !peek; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (isCellVisibleToPlayer(x, y)) {
          peek = true;
          break;
        }
      }
    }
    if (!peek) {
      showToast("Комната ещё не разведана");
      return;
    }
  }
  markRoomVisited(id);
  const prevOpened = openedRoomId;
  selectedRoomId = id;
  openedRoomId = id;
  syncOpenedRoomDoors(prevOpened, id);
  setEditTool("token", false);
  setPanelTab("rooms");
  redraw();
  const room = dungeon?.rooms.find((r) => r.id === id);
  showToast(room ? `Открыта: ${room.name}` : "Комната открыта");
}

/**
 * @param {'map'|'rooms'|'party'} id
 * @param {boolean} [fromObstaclePanel]
 */
function setPanelTab(id, fromObstaclePanel = false) {
  if (id === "map" && !canRegenerateMap(currentAccount)) {
    id = isMaster(currentAccount) ? "rooms" : "party";
  }
  if (id === "rooms" && !isMaster(currentAccount)) {
    id = "party";
  }

  if (!fromObstaclePanel && editTool === "obstacle") {
    editTool = "token";
    document.querySelectorAll(".tool-btn[data-tool]").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-tool") === "token");
    });
    updateCursor();
    updateStatus();
  }

  if (panelObstacles) {
    panelObstacles.hidden = true;
    panelObstacles.classList.remove("is-active");
  }

  const pages = {
    map: document.getElementById("panelMap"),
    rooms: document.getElementById("panelRooms"),
    party: document.getElementById("panelParty"),
  };
  document.querySelectorAll(".panel-tab").forEach((btn) => {
    const active = /** @type {HTMLElement} */ (btn).dataset.panel === id;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  for (const [key, el] of Object.entries(pages)) {
    if (!el) continue;
    const active = key === id;
    el.classList.toggle("is-active", active);
    el.hidden = !active;
  }
}

/**
 * @param {'heroes'|'enemies'} id
 */
function setPartyTab(id) {
  const panes = {
    heroes: document.getElementById("partyHeroes"),
    enemies: document.getElementById("partyEnemies"),
  };
  document.querySelectorAll(".party-tab").forEach((btn) => {
    const active = /** @type {HTMLElement} */ (btn).dataset.party === id;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  for (const [key, el] of Object.entries(panes)) {
    if (!el) continue;
    const active = key === id;
    el.classList.toggle("is-active", active);
    el.hidden = !active;
  }
}

function updatePanelCounts() {
  if (roomTabCount) {
    const total = dungeon?.rooms.length ?? 0;
    const shown =
      mapRole === "player" ? visitedRoomIds.size : total;
    roomTabCount.textContent = mapRole === "player" ? `${shown}/${total}` : String(total);
  }
  if (heroTabCount) heroTabCount.textContent = String(characters.length);
  if (enemyTabCount) enemyTabCount.textContent = String(enemies.length);
}

function closeRoom() {
  const prevOpened = openedRoomId;
  openedRoomId = null;
  syncOpenedRoomDoors(prevOpened, null);
  setEditTool("token", false);
  redraw();
  showToast("Общая карта");
  setStatus("Кликните комнату, чтобы открыть. Или поставьте жетон в коридоре.");
}

function updateCursor() {
  canvas.classList.remove("cursor-place", "cursor-obstacle");
  if (openedRoomId != null && editTool === "obstacle") canvas.classList.add("cursor-obstacle");
  else if (selectedActor) canvas.classList.add("cursor-place");
}

function setStatus(text) {
  if (statusText) statusText.textContent = text;
}

function updateStatus() {
  if (!dungeon) {
    setStatus("Сгенерируйте или восстановите карту во вкладке «Карта».");
    return;
  }
  const actor = selectedActor
    ? tokenActors().find((a) => a.id === selectedActor.id)
    : null;

  if (openedRoomId != null) {
    const room = dungeon.rooms.find((r) => r.id === openedRoomId);
    const name = room?.name || "Комната";
    if (editTool === "obstacle") {
      setStatus(`${name}: кликайте по полу, чтобы ставить и убирать препятствия. Esc — назад.`);
    } else {
      setStatus(
        actor
          ? `${name}: выбран ${actor.name}. WASD / стрелки — ход, клик — клетка.`
          : `${name}: выберите героя или врага слева.`
      );
    }
    return;
  }

  setStatus(
    actor
      ? `Выбран ${actor.name}. WASD / стрелки — ход, клик — поставить жетон.`
      : "Кликните комнату на карте, чтобы открыть её."
  );
}

function showToast(message) {
  if (!toastEl) return;
  toastEl.hidden = false;
  toastEl.textContent = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 2200);
}

/**
 * Расставить героев в стартовой комнате 3×3.
 * @param {NonNullable<typeof dungeon>} map
 */
function spawnPartyInStartRoom(map) {
  const cells = getStartSpawnCells(map);
  if (!cells.length) return [];
  /** @type {typeof tokens} */
  const next = [];
  const pcs = characters.slice(0, cells.length);
  pcs.forEach((ch, i) => {
    next.push({ actorId: ch.id, actorType: "pc", x: cells[i].x, y: cells[i].y });
  });
  // Сохранить врагов, если они уже стояли на проходимых клетках новой карты — обычно сбрасываем
  return next;
}

function updateRoomChrome() {
  btnCloseRoom.hidden = openedRoomId == null;
  btnToolbarBack.hidden = openedRoomId == null;
  if (editTools) editTools.hidden = openedRoomId == null;
  if (roomPickHint) {
    roomPickHint.hidden = openedRoomId != null;
    roomPickHint.textContent =
      openedRoomId != null
        ? ""
        : "Клик по комнате — открыть крупно";
  }
  updatePanelCounts();
  updateCursor();
  updateStatus();

  if (!roomBanner) return;
  if (openedRoomId == null || !dungeon) {
    roomBanner.hidden = true;
    roomBanner.textContent = "";
    return;
  }
  const room = dungeon.rooms.find((r) => r.id === openedRoomId);
  if (!room) {
    roomBanner.hidden = true;
    return;
  }
  const mode = editTool === "obstacle" ? "препятствия" : "жетоны";
  roomBanner.hidden = false;
  roomBanner.innerHTML = `<strong>${escapeHtml(room.name)}</strong> · ${room.w}×${room.h} · ${mode}`;
}

function renderRoomList() {
  if (!roomList) return;
  roomList.innerHTML = "";
  updatePanelCounts();
  if (!dungeon || dungeon.rooms.length === 0) {
    const empty = document.createElement("li");
    empty.className = "entity-empty";
    empty.textContent = "Сначала перегенерируйте карту.";
    roomList.appendChild(empty);
    return;
  }

  for (const room of dungeon.rooms) {
    const master = isMaster(currentAccount);
    const revealed = master || mapRole === "master" || visitedRoomIds.has(room.id);
    if (!revealed) continue;
    const li = document.createElement("li");
    const isOpen = room.id === openedRoomId;
    const unlocked = unlockedRoomIds.has(room.id);
    const isStart = room.id === (dungeon.startRoomId ?? 0);
    li.className = "entity-card" + (isOpen ? " is-open" : "") + (!unlocked ? " is-locked-room" : "");
    const occupants = tokens.filter((t) => findRoomAt([room], t.x, t.y)).length;
    let obstacles = 0;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (dungeon.grid[y][x] === "obstacle") obstacles += 1;
      }
    }
    const pills = [
      room.role === "start" ? `<span class="pill lvl">вход</span>` : "",
      room.role === "end" ? `<span class="pill danger">босс</span>` : "",
      room.shape && room.shape !== "rect"
        ? `<span class="pill">${escapeHtml(ROOM_SHAPE_LABELS[room.shape] || room.shape)}</span>`
        : "",
      unlocked
        ? `<span class="pill ok">открыта</span>`
        : `<span class="pill danger">закрыта</span>`,
      `<span class="pill">${room.w}×${room.h}</span>`,
      occupants ? `<span class="pill">${occupants} жет.</span>` : "",
      obstacles ? `<span class="pill">${obstacles} преп.</span>` : "",
    ]
      .filter(Boolean)
      .join("");

    const unlockBtn =
      master && !isStart
        ? `<button type="button" class="entity-action${unlocked ? "" : " primary"}" data-unlock-room="${room.id}" title="${unlocked ? "Закрыть вход для игроков" : "Разрешить игрокам войти"}">
            ${unlocked ? "Закрыть" : "Вход"}
          </button>`
        : "";

    const openBtn = master
      ? `<button type="button" class="entity-action${isOpen ? "" : !unlocked ? "" : " primary"}" data-open-room="${room.id}">
          ${isOpen ? "Закрыть вид" : "Открыть"}
        </button>`
      : "";

    li.innerHTML = `
      <span class="entity-avatar num">${room.id + 1}</span>
      <div class="entity-info">
        <strong>${escapeHtml(room.name)}</strong>
        <div class="entity-stats">${pills}</div>
      </div>
      <div class="entity-actions">
        ${unlockBtn}
        ${openBtn}
      </div>
    `;
    li.addEventListener("click", (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest("[data-open-room], [data-unlock-room]")) return;
      if (isOpen) closeRoom();
      else openRoom(room.id);
    });
    li.querySelector("[data-open-room]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isOpen) closeRoom();
      else openRoom(room.id);
    });
    li.querySelector("[data-unlock-room]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      setRoomUnlocked(room.id, !unlocked);
    });
    roomList.appendChild(li);
  }

  if (!roomList.children.length) {
    const empty = document.createElement("li");
    empty.className = "entity-empty";
    empty.textContent = "Нет разведанных комнат.";
    roomList.appendChild(empty);
  }
}

/**
 * @param {string | null} id
 * @param {{ viewOnly?: boolean }} [opts]
 */
function openCharEditor(id, opts = {}) {
  if (!id) {
    if (!canCreateCharacter(currentAccount)) {
      showToast("Создавать героев может только мастер");
      return;
    }
    charViewOnly = false;
  } else {
    const existing = characters.find((c) => c.id === id);
    if (!existing) {
      showToast("Герой не найден");
      return;
    }
    const canEdit = canEditCharacter(currentAccount, id);
    charViewOnly = opts.viewOnly === true || !canEdit;
  }

  editingCharId = id;
  const title = document.getElementById("charDialogTitle");
  const ch = id ? characters.find((c) => c.id === id) : makeCharacter({ recalculate: true });
  if (!ch) return;
  if (title) {
    title.textContent = !id
      ? "Новый персонаж"
      : charViewOnly
        ? ch.name
        : "Редактор персонажа";
  }
  const kicker = document.querySelector("#charDialog .profile-kicker");
  if (kicker) kicker.textContent = charViewOnly ? "Просмотр героя" : "Профиль героя";

  setAdvTab("attrs");
  fillCharForm(ch);
  updateCharRefLinks();
  updateAdvClassLine();
  applyCharEditorMode();
  charDialog.showModal();
  if (!charViewOnly) {
    /** @type {HTMLInputElement} */ (document.getElementById("charName")).focus();
  }
}

function applyCharEditorMode() {
  const saveBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("btnSaveChar"));
  const cancelFooter = /** @type {HTMLButtonElement | null} */ (document.getElementById("btnCancelCharFooter"));
  const suggestBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("btnSuggestAbilities"));
  const recalcBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("btnRecalcChar"));
  const clearPortrait = /** @type {HTMLButtonElement | null} */ (document.getElementById("btnClearPortrait"));
  const portraitLabel = document.querySelector(".profile-photo-actions label.profile-btn");
  const portraitNav = document.querySelectorAll("#btnPortraitPrev, #btnPortraitNext");

  charForm.classList.toggle("is-readonly", charViewOnly);

  charForm.querySelectorAll("input, select, textarea").forEach((el) => {
    /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} */ (el).disabled = charViewOnly;
  });

  charForm.querySelectorAll(".adv-step, [data-ability-dec], [data-ability-inc], [data-skill-dec], [data-skill-inc]").forEach((el) => {
    /** @type {HTMLButtonElement} */ (el).disabled = charViewOnly;
  });

  if (saveBtn) saveBtn.hidden = charViewOnly;
  if (cancelFooter) cancelFooter.textContent = charViewOnly ? "Закрыть" : "Отмена";
  btnDeleteChar.hidden = charViewOnly || !editingCharId || !canDeleteCharacter(currentAccount, editingCharId);
  if (suggestBtn) suggestBtn.hidden = charViewOnly;
  if (recalcBtn) recalcBtn.hidden = charViewOnly;
  if (portraitLabel) /** @type {HTMLElement} */ (portraitLabel).hidden = charViewOnly;
  if (clearPortrait) clearPortrait.hidden = charViewOnly || clearPortrait.hidden;
  portraitNav.forEach((btn) => {
    /** @type {HTMLButtonElement} */ (btn).disabled = charViewOnly;
  });
}

/**
 * @param {import('./characters.js').Character} ch
 */
function fillCharForm(ch) {
  /** @type {HTMLInputElement} */ (document.getElementById("charName")).value = ch.name;
  /** @type {HTMLInputElement} */ (document.getElementById("charLevel")).value = String(ch.level);
  /** @type {HTMLSelectElement} */ (document.getElementById("charAncestry")).value = ch.ancestryId;
  /** @type {HTMLSelectElement} */ (document.getElementById("charBackground")).value = ch.backgroundId;
  /** @type {HTMLSelectElement} */ (document.getElementById("charClass")).value = ch.classId;
  setAbilityInputs(ch.abilities);
  /** @type {HTMLInputElement} */ (document.getElementById("charHp")).value = String(ch.hp);
  /** @type {HTMLInputElement} */ (document.getElementById("charHpMax")).value = String(ch.hpMax);
  /** @type {HTMLInputElement} */ (document.getElementById("charAc")).value = String(ch.ac);
  /** @type {HTMLInputElement} */ (document.getElementById("charFort")).value = String(ch.fort);
  /** @type {HTMLInputElement} */ (document.getElementById("charRef")).value = String(ch.ref);
  /** @type {HTMLInputElement} */ (document.getElementById("charWill")).value = String(ch.will);
  /** @type {HTMLInputElement} */ (document.getElementById("charPerception")).value = String(ch.perception);
  /** @type {HTMLInputElement} */ (document.getElementById("charSpeed")).value = String(ch.speed);
  /** @type {HTMLInputElement} */ (document.getElementById("charColor")).value = ch.color;
  /** @type {HTMLSelectElement} */ (document.getElementById("charSymbol")).value = ch.symbol;
  /** @type {HTMLInputElement} */ (document.getElementById("charAttack")).value = ch.attack || "";
  /** @type {HTMLInputElement} */ (document.getElementById("charNote")).value = ch.note || "";
  const bio = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("charBio"));
  if (bio) bio.value = ch.bio || "";

  draftPortrait = ch.portrait || "";
  draftFeats = [...(ch.feats || [])];
  draftSkills = { ...(ch.skills || {}) };

  document.querySelectorAll("#charFeatList [data-feat]").forEach((cb) => {
    const el = /** @type {HTMLInputElement} */ (cb);
    el.checked = draftFeats.includes(el.dataset.feat || "");
  });
  const featCount = document.getElementById("advFeatCount");
  if (featCount) featCount.textContent = String(draftFeats.length);

  renderSkillRanks();
  updatePortraitUi();
  updateAdvClassLine();
}

/**
 * @param {Record<string, number>} mods
 */
function setAbilityInputs(mods) {
  document.querySelectorAll("#charAbilities [data-ability]").forEach((input) => {
    const el = /** @type {HTMLInputElement} */ (input);
    const key = el.getAttribute("data-ability") || "str";
    el.value = String(mods[key] ?? 0);
  });
  refreshAbilityHighlights();
}

function readAbilities() {
  /** @type {Record<string, number>} */
  const abilities = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  document.querySelectorAll("#charAbilities [data-ability]").forEach((input) => {
    const el = /** @type {HTMLInputElement} */ (input);
    const key = el.getAttribute("data-ability") || "str";
    abilities[key] = Number(el.value) || 0;
  });
  return abilities;
}

/**
 * @param {string | null} id
 */
function readCharForm(id) {
  draftFeats = [...document.querySelectorAll("#charFeatList [data-feat]:checked")].map(
    (el) => /** @type {HTMLInputElement} */ (el).dataset.feat || ""
  );
  return makeCharacter({
    id: id || undefined,
    name: /** @type {HTMLInputElement} */ (document.getElementById("charName")).value,
    level: Number(/** @type {HTMLInputElement} */ (document.getElementById("charLevel")).value),
    ancestryId: /** @type {HTMLSelectElement} */ (document.getElementById("charAncestry")).value,
    backgroundId: /** @type {HTMLSelectElement} */ (document.getElementById("charBackground")).value,
    classId: /** @type {HTMLSelectElement} */ (document.getElementById("charClass")).value,
    abilities: readAbilities(),
    hp: Number(/** @type {HTMLInputElement} */ (document.getElementById("charHp")).value),
    hpMax: Number(/** @type {HTMLInputElement} */ (document.getElementById("charHpMax")).value),
    ac: Number(/** @type {HTMLInputElement} */ (document.getElementById("charAc")).value),
    fort: Number(/** @type {HTMLInputElement} */ (document.getElementById("charFort")).value),
    ref: Number(/** @type {HTMLInputElement} */ (document.getElementById("charRef")).value),
    will: Number(/** @type {HTMLInputElement} */ (document.getElementById("charWill")).value),
    perception: Number(/** @type {HTMLInputElement} */ (document.getElementById("charPerception")).value),
    speed: Number(/** @type {HTMLInputElement} */ (document.getElementById("charSpeed")).value),
    color: /** @type {HTMLInputElement} */ (document.getElementById("charColor")).value,
    symbol: /** @type {HTMLSelectElement} */ (document.getElementById("charSymbol")).value,
    attack: /** @type {HTMLInputElement} */ (document.getElementById("charAttack")).value,
    note: /** @type {HTMLInputElement} */ (document.getElementById("charNote")).value,
    bio: /** @type {HTMLTextAreaElement} */ (document.getElementById("charBio")).value,
    portrait: draftPortrait,
    feats: draftFeats,
    skills: draftSkills,
    recalculate: false,
  });
}

function updateCharRefLinks() {
  const ancestryId = /** @type {HTMLSelectElement} */ (document.getElementById("charAncestry")).value;
  const classId = /** @type {HTMLSelectElement} */ (document.getElementById("charClass")).value;
  const aLink = /** @type {HTMLAnchorElement | null} */ (document.getElementById("charAncestryLink"));
  const cLink = /** @type {HTMLAnchorElement | null} */ (document.getElementById("charClassLink"));
  if (aLink && ANCESTRIES[ancestryId]) aLink.href = ANCESTRIES[ancestryId].url;
  if (cLink && CLASSES[classId]) cLink.href = CLASSES[classId].url;
}

/**
 * @param {string | null} id
 */
function openEnemyEditor(id) {
  if (!canManageEnemies(currentAccount)) {
    showToast("Врагов редактирует только мастер");
    return;
  }
  editingEnemyId = id;
  const title = document.getElementById("enemyDialogTitle");
  const en = id ? enemies.find((e) => e.id === id) : makeEnemy({ recalculate: true });
  if (title) title.textContent = id ? "Редактор врага PF2e" : "Новый враг PF2e";
  btnDeleteEnemy.hidden = !id;
  fillEnemyForm(en || makeEnemy({ recalculate: true }));
  enemyDialog.showModal();
  /** @type {HTMLInputElement} */ (document.getElementById("enemyName")).focus();
}

/**
 * @param {import('./enemies.js').Enemy} en
 */
function fillEnemyForm(en) {
  /** @type {HTMLInputElement} */ (document.getElementById("enemyName")).value = en.name;
  /** @type {HTMLInputElement} */ (document.getElementById("enemyLevel")).value = String(en.level);
  /** @type {HTMLSelectElement} */ (document.getElementById("enemyType")).value = en.creatureType;
  /** @type {HTMLSelectElement} */ (document.getElementById("enemySize")).value = en.size;
  /** @type {HTMLInputElement} */ (document.getElementById("enemyHp")).value = String(en.hp);
  /** @type {HTMLInputElement} */ (document.getElementById("enemyHpMax")).value = String(en.hpMax);
  /** @type {HTMLInputElement} */ (document.getElementById("enemyAc")).value = String(en.ac);
  /** @type {HTMLInputElement} */ (document.getElementById("enemyFort")).value = String(en.fort);
  /** @type {HTMLInputElement} */ (document.getElementById("enemyRef")).value = String(en.ref);
  /** @type {HTMLInputElement} */ (document.getElementById("enemyWill")).value = String(en.will);
  /** @type {HTMLInputElement} */ (document.getElementById("enemyPerception")).value = String(en.perception);
  /** @type {HTMLInputElement} */ (document.getElementById("enemySpeed")).value = String(en.speed);
  /** @type {HTMLInputElement} */ (document.getElementById("enemyAttack")).value = String(en.attackBonus);
  /** @type {HTMLInputElement} */ (document.getElementById("enemyDamage")).value = en.damage;
  /** @type {HTMLInputElement} */ (document.getElementById("enemyTraits")).value = en.traits;
  /** @type {HTMLInputElement} */ (document.getElementById("enemyColor")).value = en.color;
  /** @type {HTMLSelectElement} */ (document.getElementById("enemySymbol")).value = en.symbol;
  /** @type {HTMLTextAreaElement} */ (document.getElementById("enemyNote")).value = en.note;
}

/**
 * @param {string | null} id
 */
function readEnemyForm(id) {
  return makeEnemy({
    id: id || undefined,
    name: /** @type {HTMLInputElement} */ (document.getElementById("enemyName")).value,
    level: Number(/** @type {HTMLInputElement} */ (document.getElementById("enemyLevel")).value),
    creatureType: /** @type {HTMLSelectElement} */ (document.getElementById("enemyType")).value,
    size: /** @type {HTMLSelectElement} */ (document.getElementById("enemySize")).value,
    hp: Number(/** @type {HTMLInputElement} */ (document.getElementById("enemyHp")).value),
    hpMax: Number(/** @type {HTMLInputElement} */ (document.getElementById("enemyHpMax")).value),
    ac: Number(/** @type {HTMLInputElement} */ (document.getElementById("enemyAc")).value),
    fort: Number(/** @type {HTMLInputElement} */ (document.getElementById("enemyFort")).value),
    ref: Number(/** @type {HTMLInputElement} */ (document.getElementById("enemyRef")).value),
    will: Number(/** @type {HTMLInputElement} */ (document.getElementById("enemyWill")).value),
    perception: Number(/** @type {HTMLInputElement} */ (document.getElementById("enemyPerception")).value),
    speed: Number(/** @type {HTMLInputElement} */ (document.getElementById("enemySpeed")).value),
    attackBonus: Number(/** @type {HTMLInputElement} */ (document.getElementById("enemyAttack")).value),
    damage: /** @type {HTMLInputElement} */ (document.getElementById("enemyDamage")).value,
    traits: /** @type {HTMLInputElement} */ (document.getElementById("enemyTraits")).value,
    color: /** @type {HTMLInputElement} */ (document.getElementById("enemyColor")).value,
    symbol: /** @type {HTMLSelectElement} */ (document.getElementById("enemySymbol")).value,
    note: /** @type {HTMLTextAreaElement} */ (document.getElementById("enemyNote")).value,
    recalculate: false,
  });
}

function renderCharList() {
  if (!charList) return;
  charList.innerHTML = "";
  updatePanelCounts();
  if (characters.length === 0) {
    const empty = document.createElement("li");
    empty.className = "entity-empty";
    empty.textContent = "Нет героев — нажмите «+ Герой».";
    charList.appendChild(empty);
    return;
  }

  for (const ch of characters) {
    const selected = selectedActor?.type === "pc" && selectedActor.id === ch.id;
    const canEdit = canEditCharacter(currentAccount, ch.id);
    const owner = accounts.find((a) => a.role === "player" && a.characterId === ch.id);
    const li = document.createElement("li");
    li.className = "entity-card" + (selected ? " is-selected" : "");
    li.innerHTML = `
      <span class="entity-avatar" style="background:${ch.color}${ch.portrait ? `;background-image:url(${ch.portrait});background-size:cover;background-position:center` : ""}">${ch.portrait ? "" : ch.symbol}</span>
      <div class="entity-info">
        <strong>${escapeHtml(ch.name)}</strong>
        <span class="entity-sub">${escapeHtml(ch.ancestryName)} · ${escapeHtml(ch.className)}${owner ? ` · ${escapeHtml(owner.name)}` : ""}</span>
        <div class="entity-stats">
          <span class="pill lvl">Ур. ${ch.level}</span>
          <span class="pill">ОЗ ${ch.hp}/${ch.hpMax}</span>
          <span class="pill">КЗ ${ch.ac}</span>
        </div>
      </div>
      ${
        canEdit
          ? `<button type="button" class="entity-action" data-edit="${ch.id}">Изм.</button>`
          : `<button type="button" class="entity-action ghost" data-view="${ch.id}">Лист</button>`
      }
    `;
    li.addEventListener("click", (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest("[data-edit], [data-view]")) return;
      selectActor("pc", ch.id);
    });
    li.querySelector("[data-edit]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openCharEditor(ch.id);
    });
    li.querySelector("[data-view]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openCharEditor(ch.id, { viewOnly: true });
    });
    charList.appendChild(li);
  }
}

function renderEnemyList() {
  if (!enemyList) return;
  enemyList.innerHTML = "";
  updatePanelCounts();
  if (enemies.length === 0) {
    const empty = document.createElement("li");
    empty.className = "entity-empty";
    empty.textContent = "Нет врагов — бестиарий или «+ Враг».";
    enemyList.appendChild(empty);
    return;
  }

  for (const en of enemies) {
    const selected = selectedActor?.type === "enemy" && selectedActor.id === en.id;
    const li = document.createElement("li");
    li.className = "entity-card is-enemy" + (selected ? " is-selected" : "");
    li.innerHTML = `
      <span class="entity-avatar" style="background:${en.color}">${en.symbol}</span>
      <div class="entity-info">
        <strong>${escapeHtml(en.name)}</strong>
        <span class="entity-sub">${escapeHtml(en.creatureTypeName)}</span>
        <div class="entity-stats">
          <span class="pill danger">Ур. ${en.level}</span>
          <span class="pill">ОЗ ${en.hp}/${en.hpMax}</span>
          <span class="pill">КЗ ${en.ac}</span>
          <span class="pill">${formatMod(en.attackBonus)}</span>
        </div>
      </div>
      <button type="button" class="entity-action" data-edit-enemy="${en.id}">Изм.</button>
    `;
    li.addEventListener("click", (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest("[data-edit-enemy]")) return;
      selectActor("enemy", en.id);
    });
    const editBtn = li.querySelector("[data-edit-enemy]");
    if (!canManageEnemies(currentAccount)) {
      editBtn?.remove();
    } else {
      editBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        openEnemyEditor(en.id);
      });
    }
    enemyList.appendChild(li);
  }
}

async function openBestiary() {
  bestiaryDialog.showModal();
  if (bestiaryStatus) bestiaryStatus.textContent = "Загрузка бестиария…";
  try {
    bestiaryData = await loadBestiary();
    if (bestiaryStatus) {
      bestiaryStatus.textContent = `В базе ${bestiaryData.length} существ. Названия на русском (pf2.ru).`;
    }
    renderBestiaryList();
    bestiaryQuery?.focus();
  } catch (err) {
    if (bestiaryStatus) {
      bestiaryStatus.textContent = "Не удалось загрузить data/bestiary.json. Проверьте локальный сервер.";
    }
    showToast("Ошибка загрузки бестиария");
  }
}

function renderBestiaryList() {
  if (!bestiaryList) return;
  const levelMinRaw = bestiaryLevelMin?.value;
  const levelMaxRaw = bestiaryLevelMax?.value;
  const filtered = filterBestiary(bestiaryData, {
    query: bestiaryQuery?.value || "",
    creatureType: bestiaryType?.value || "",
    levelMin: levelMinRaw === "" || levelMinRaw == null ? null : Number(levelMinRaw),
    levelMax: levelMaxRaw === "" || levelMaxRaw == null ? null : Number(levelMaxRaw),
  });

  const shown = filtered.slice(0, 120);
  bestiaryList.innerHTML = "";

  if (bestiaryStatus && bestiaryData.length) {
    bestiaryStatus.textContent =
      filtered.length > shown.length
        ? `Найдено ${filtered.length}, показаны первые ${shown.length}. Уточните поиск.`
        : `Найдено: ${filtered.length}`;
  }

  if (shown.length === 0) {
    const empty = document.createElement("li");
    empty.className = "hint";
    empty.style.padding = "0.75rem";
    empty.textContent = "Ничего не найдено.";
    bestiaryList.appendChild(empty);
    return;
  }

  for (const entry of shown) {
    const typeName = CREATURE_TYPES.find((t) => t.id === entry.creatureType)?.name || entry.creatureType;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bestiary-item" + (selectedBestiaryEntry?.id === entry.id ? " is-active" : "");
    btn.innerHTML = `
      <span class="bestiary-lvl">${entry.level}</span>
      <div>
        <strong>${escapeHtml(entry.name)}</strong>
        ${entry.nameEn && entry.nameEn !== entry.name ? `<span class="meta en-name">${escapeHtml(entry.nameEn)}</span>` : ""}
        <span class="meta">${escapeHtml(typeName)} · КЗ ${entry.ac} · ОЗ ${entry.hp}</span>
      </div>
    `;
    btn.addEventListener("click", () => {
      selectedBestiaryEntry = entry;
      renderBestiaryList();
      renderBestiaryDetail(entry);
    });
    bestiaryList.appendChild(btn);
  }
}

/**
 * @param {import('./bestiary.js').BestiaryEntry} entry
 */
function renderBestiaryDetail(entry) {
  if (!bestiaryDetail) return;
  const typeName = CREATURE_TYPES.find((t) => t.id === entry.creatureType)?.name || entry.creatureType;
  const sizeName = SIZES.find((s) => s.id === entry.size)?.name || entry.size;
  const attack = entry.attackBonus != null ? formatBestiaryMod(entry.attackBonus) : "—";
  const traits = (entry.traits || []).join(", ") || "—";

  bestiaryDetail.innerHTML = `
    <h3>${escapeHtml(entry.name)}</h3>
    ${entry.nameEn && entry.nameEn !== entry.name ? `<p class="hint en-name">${escapeHtml(entry.nameEn)}</p>` : ""}
    <p class="hint">Уровень ${entry.level} · ${escapeHtml(typeName)} · ${escapeHtml(sizeName)} · ${escapeHtml(entry.source || "PF2e")}</p>
    <div class="bestiary-stats">
      <div class="bestiary-stat"><em>ОЗ</em><strong>${entry.hp}</strong></div>
      <div class="bestiary-stat"><em>КЗ</em><strong>${entry.ac}</strong></div>
      <div class="bestiary-stat"><em>Восприятие</em><strong>${formatBestiaryMod(entry.perception)}</strong></div>
      <div class="bestiary-stat"><em>Стойкость</em><strong>${formatBestiaryMod(entry.fort)}</strong></div>
      <div class="bestiary-stat"><em>Реакция</em><strong>${formatBestiaryMod(entry.ref)}</strong></div>
      <div class="bestiary-stat"><em>Воля</em><strong>${formatBestiaryMod(entry.will)}</strong></div>
      <div class="bestiary-stat"><em>Скорость</em><strong>${entry.speed}</strong></div>
      <div class="bestiary-stat"><em>Атака</em><strong>${attack}</strong></div>
      <div class="bestiary-stat"><em>Урон</em><strong>${escapeHtml(entry.damage || "—")}</strong></div>
    </div>
    <p class="hint"><strong>Черты:</strong> ${escapeHtml(traits)}</p>
    ${entry.note ? `<p class="hint">${escapeHtml(entry.note)}</p>` : ""}
    <div class="bestiary-actions">
      <button type="button" class="btn primary" id="btnAddBestiaryEnemy">Добавить как врага</button>
      <a class="btn ghost" href="${pf2Url(entry)}" target="_blank" rel="noopener noreferrer">Открыть на pf2.ru</a>
      <a class="btn ghost" href="${aonUrl(entry)}" target="_blank" rel="noopener noreferrer">Archives of Nethys</a>
    </div>
  `;

  document.getElementById("btnAddBestiaryEnemy")?.addEventListener("click", () => {
    addEnemyFromBestiary(entry);
  });
}

/**
 * @param {import('./bestiary.js').BestiaryEntry} entry
 */
function addEnemyFromBestiary(entry) {
  const enemy = bestiaryToEnemy(entry);
  enemies.push(enemy);
  saveEnemies(enemies);
  selectedActor = { type: "enemy", id: enemy.id };
  setPanelTab("party");
  setPartyTab("enemies");
  renderEnemyList();
  renderCharList();
  updateStatus();
  updateCursor();
  showToast(`${enemy.name} добавлен во врагов`);
  bestiaryDialog.close();
}

function updateLegend() {
  if (!legend || !dungeon) return;
  const t = dungeon.theme;
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch" style="background:${t.floor}"></span>Пол</span>
    <span class="legend-item"><span class="legend-swatch" style="background:${t.corridor}"></span>Проход</span>
    <span class="legend-item"><span class="legend-swatch" style="background:${t.wall}"></span>Стена</span>
    <span class="legend-item"><span class="legend-swatch" style="background:${t.door}"></span>Дверь</span>
    <span class="legend-item"><span class="legend-swatch" style="background:${t.obstacle}"></span>${escapeHtml(t.obstacleLabel)}</span>
  `;
}

function redraw() {
  const visibleCells = getPlayerVisibleCells();
  hitMap = renderMap(canvas, dungeon, view, tokens, tokenActors(), {
    selectedRoomId,
    openedRoomId,
    isoRotation,
    zoom: mapZoom,
    panX: mapPanX,
    panY: mapPanY,
    visibleCells,
    visitedRoomIds: mapRole === "player" ? visitedRoomIds : null,
    selectedActorId: selectedActor?.id ?? null,
    obstacleVariants,
    doorStates,
  });
  renderRoomList();
  updateRoomChrome();
  updateIsoRotateUi();
  updateZoomLabel();
}

function updateZoomLabel() {
  if (zoomLabelBtn) zoomLabelBtn.textContent = `${Math.round(mapZoom * 100)}%`;
}

/**
 * @param {number} factor
 * @param {number} [mx]
 * @param {number} [my]
 */
function zoomMap(factor, mx, my) {
  const wrap = canvasWrap || canvas.parentElement;
  const cssW = wrap?.clientWidth || 960;
  const cssH = wrap?.clientHeight || 640;
  const cx = mx == null ? cssW / 2 : mx;
  const cy = my == null ? cssH / 2 : my;
  const oldZoom = mapZoom;
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldZoom * factor));
  if (Math.abs(next - oldZoom) < 0.001) return;

  const wx = (cx - cssW / 2 - mapPanX) / oldZoom;
  const wy = (cy - cssH / 2 - mapPanY) / oldZoom;
  mapZoom = next;
  mapPanX = cx - cssW / 2 - wx * next;
  mapPanY = cy - cssH / 2 - wy * next;
  redraw();
}

function resetMapZoom() {
  mapZoom = 1;
  mapPanX = 0;
  mapPanY = 0;
  redraw();
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * @param {'pc'|'enemy'} type
 * @param {string} id
 */
function canControlActor(type, id) {
  if (!currentAccount) return false;
  if (isMaster(currentAccount)) return true;
  if (type !== "pc") return false;
  return currentAccount.characterId === id;
}

function updateAccountUi() {
  if (accountChipName) {
    accountChipName.textContent = currentAccount?.name || "Войти";
  }
  if (accountChipRole) {
    accountChipRole.classList.remove("is-player", "is-guest");
    if (!currentAccount) {
      accountChipRole.textContent = "гост";
      accountChipRole.classList.add("is-guest");
    } else if (currentAccount.role === "player") {
      accountChipRole.textContent = "игрок";
      accountChipRole.classList.add("is-player");
    } else {
      accountChipRole.textContent = "мастер";
    }
  }
  if (accountSessionNote) {
    if (!currentAccount) {
      accountSessionNote.textContent = "Сейчас никто не вошёл. Выберите аккаунт или создайте новый.";
    } else if (currentAccount.role === "master") {
      accountSessionNote.textContent = `Вы вошли как мастер «${currentAccount.name}». Можно править статы всех героев.`;
    } else {
      const ch = characters.find((c) => c.id === currentAccount.characterId);
      accountSessionNote.textContent = ch
        ? `Вы вошли как игрок «${currentAccount.name}» · персонаж «${ch.name}».`
        : `Вы вошли как игрок «${currentAccount.name}», но персонаж не привязан.`;
    }
  }
  updatePermissionUi();
}

function updatePermissionUi() {
  const btnNewChar = /** @type {HTMLButtonElement | null} */ (document.getElementById("btnNewChar"));
  const btnBestiary = /** @type {HTMLButtonElement | null} */ (document.getElementById("btnBestiary"));
  const btnGenerate = /** @type {HTMLButtonElement | null} */ (document.getElementById("btnGenerate"));
  const btnRegenToolbar = /** @type {HTMLButtonElement | null} */ (document.getElementById("btnRegenToolbar"));
  const mapGenControls = document.getElementById("mapGenControls");
  const mapPlayerNote = document.getElementById("mapPlayerNote");
  const master = isMaster(currentAccount);
  const player = isPlayer(currentAccount);
  const canGen = canRegenerateMap(currentAccount);

  document.documentElement.classList.toggle("is-player", !!currentAccount && !master);

  if (btnNewChar) btnNewChar.hidden = !canCreateCharacter(currentAccount);
  if (btnBestiary) btnBestiary.hidden = !canManageEnemies(currentAccount);
  if (btnGenerate) btnGenerate.hidden = !canGen;
  if (btnRegenToolbar) btnRegenToolbar.hidden = !canGen;
  if (mapGenControls) mapGenControls.hidden = !canGen;
  if (mapPlayerNote) mapPlayerNote.hidden = canGen;

  if (player) {
    setPanelTab("party");
  } else if (!canGen) {
    const mapTab = document.querySelector('.panel-tab[data-panel="map"].is-active');
    const mapPage = document.getElementById("panelMap");
    if (mapTab || (mapPage && !mapPage.hidden && mapPage.classList.contains("is-active"))) {
      setPanelTab("rooms");
    }
  }

  const toolObstacle = document.getElementById("toolObstacle");
  if (toolObstacle) {
    /** @type {HTMLButtonElement} */ (toolObstacle).hidden = !master;
  }

  const partyPlaceHint = document.getElementById("partyPlaceHint");
  if (partyPlaceHint) {
    partyPlaceHint.textContent = isPlayer(currentAccount)
      ? "Выберите героя — ходите стрелками / WASD"
      : "Выберите и кликните клетку";
  }

  const roomPickHint = document.getElementById("roomPickHint");
  if (roomPickHint) {
    roomPickHint.textContent = master
      ? "«Вход» — разрешить игрокам пройти в комнату. «Открыть» — вид крупно."
      : "В следующую комнату можно только после разрешения мастера.";
  }
}

function openAccountDialog() {
  void loadAccounts()
    .then((list) => {
      accounts = list;
      fillAccountCharacterSelect();
      syncAccountCreateFields();
      renderAccountList();
      updateAccountUi();
      accountDialog?.showModal();
    })
    .catch(() => {
      fillAccountCharacterSelect();
      syncAccountCreateFields();
      renderAccountList();
      updateAccountUi();
      accountDialog?.showModal();
    });
}

function syncAccountCreateFields() {
  const role = accountRoleSelect?.value || "player";
  if (accountCharField) accountCharField.hidden = role !== "player";
}

function fillAccountCharacterSelect() {
  if (!accountCharacterSelect) return;
  const linked = new Set(
    accounts.filter((a) => a.role === "player" && a.characterId).map((a) => a.characterId)
  );
  accountCharacterSelect.innerHTML = characters
    .map((ch) => {
      const taken = linked.has(ch.id) ? " (занят)" : "";
      return `<option value="${ch.id}">${escapeHtml(ch.name)}${taken}</option>`;
    })
    .join("");
  if (!characters.length) {
    accountCharacterSelect.innerHTML = `<option value="">Нет героев — сначала создайте</option>`;
  }
}

function renderAccountList() {
  if (!accountList) return;
  accountList.innerHTML = "";
  if (!accounts.length) {
    const empty = document.createElement("li");
    empty.className = "entity-empty";
    empty.textContent = "Нет аккаунтов.";
    accountList.appendChild(empty);
    return;
  }

  for (const acc of accounts) {
    const active = currentAccount?.id === acc.id;
    const ch = acc.characterId ? characters.find((c) => c.id === acc.characterId) : null;
    const li = document.createElement("li");
    li.className = "entity-card" + (active ? " is-selected" : "");
    li.innerHTML = `
      <span class="entity-avatar num">${acc.role === "master" ? "М" : "И"}</span>
      <div class="entity-info">
        <strong>${escapeHtml(acc.name)}</strong>
        <span class="entity-sub">${acc.role === "master" ? "Мастер" : ch ? `Игрок · ${escapeHtml(ch.name)}` : "Игрок · без персонажа"}${accountNeedsPin(acc) ? " · PIN" : ""}</span>
      </div>
      <button type="button" class="entity-action${active ? "" : " primary"}" data-login="${acc.id}">
        ${active ? "Текущий" : "Войти"}
      </button>
    `;
    if (!active) {
      li.querySelector("[data-login]")?.addEventListener("click", (e) => {
        e.stopPropagation();
        tryLoginAccount(acc.id);
      });
      li.addEventListener("click", (e) => {
        if (/** @type {HTMLElement} */ (e.target).closest("[data-login]")) return;
        tryLoginAccount(acc.id);
      });
    }
    accountList.appendChild(li);
  }
}

/**
 * @param {string} accountId
 */
function tryLoginAccount(accountId) {
  const acc = accounts.find((a) => a.id === accountId);
  if (!acc) return;
  if (accountNeedsPin(acc)) {
    pendingPinAccountId = accountId;
    if (accountPinLabel) accountPinLabel.textContent = `PIN для «${acc.name}»`;
    if (accountPinInput) accountPinInput.value = "";
    accountPinDialog?.showModal();
    accountPinInput?.focus();
    return;
  }
  void loginAs(accountId, "", true).then((ok) => {
    if (ok) accountDialog?.close();
  });
}

/**
 * @param {string} accountId
 * @param {string} pin
 * @param {boolean} [announce]
 * @returns {Promise<boolean>}
 */
async function loginAs(accountId, pin, announce = true) {
  try {
    currentAccount = await loginAsAccount(accountId, pin);
    applyAccountSession(announce);
    return true;
  } catch {
    showToast("Неверный PIN");
    return false;
  }
}

/**
 * @param {boolean} [announce]
 */
function applyAccountSession(announce = true) {
  updateAccountUi();
  if (currentAccount?.role === "player") {
    setMapRole("player", false);
    if (editTool === "obstacle") setEditTool("token", false);
    if (currentAccount.characterId) {
      selectedActor = { type: "pc", id: currentAccount.characterId };
    }
  } else if (currentAccount?.role === "master") {
    setMapRole("master", false);
  }
  renderCharList();
  renderEnemyList();
  updateStatus();
  redraw();
  if (announce && currentAccount) {
    showToast(
      currentAccount.role === "master"
        ? `Мастер: ${currentAccount.name}`
        : `Игрок: ${currentAccount.name}`
    );
  }
}

renderCharList();
renderEnemyList();
updateAccountUi();

/**
 * Миграция localStorage → SQLite при первом запуске сервера.
 * @param {{ accounts: unknown, characters: unknown, enemies: unknown, map: unknown }} state
 */
async function migrateLegacyIfNeeded(state) {
  const empty =
    state.accounts == null &&
    state.characters == null &&
    state.enemies == null &&
    state.map == null;
  if (!empty) return state;

  const legacyAccounts = readLegacyAccounts();
  const legacyCharacters = readLegacyCharacters();
  const legacyEnemies = readLegacyEnemies();
  let legacyMap = null;
  try {
    const raw = localStorage.getItem(MAP_STORAGE_KEY);
    if (raw) legacyMap = JSON.parse(raw);
  } catch {
    /* ignore */
  }

  if (!legacyAccounts && !legacyCharacters && !legacyEnemies && !legacyMap) {
    return state;
  }

  const next = {
    accounts: legacyAccounts,
    characters: legacyCharacters,
    enemies: legacyEnemies,
    map: legacyMap,
  };
  await putState(next);
  showToast("Данные перенесены из браузера в SQLite");
  return next;
}

async function boot() {
  setStatus("Подключение к SQLite…");
  const ok = await pingApi();
  if (!ok) {
    setStatus("Сервер не запущен. Выполните: python -m server.main");
    showToast("Нет связи с сервером (python -m server.main)");
    stageHint?.classList.remove("is-hidden");
    if (stageHint) stageHint.textContent = "Запустите сервер: python -m server.main";
    return;
  }

  let state = await fetchState();
  state = await migrateLegacyIfNeeded(state);

  characters = hydrateCharacters(state.characters);
  enemies = hydrateEnemies(state.enemies);
  accounts = hydrateAccounts(state.accounts);

  // Первичная запись дефолтов в БД
  if (state.characters == null) await saveCharacters(characters);
  if (state.enemies == null) await saveEnemies(enemies);

  currentAccount = await fetchMe();

  selectedActor = characters[0] ? { type: "pc", id: characters[0].id } : null;

  renderCharList();
  renderEnemyList();
  updateAccountUi();

  if (currentAccount) {
    applyAccountSession(false);
  } else {
    const master = accounts.find((a) => a.role === "master");
    if (master) await loginAs(master.id, "", false);
  }

  const mapLoaded = state.map ? applyMapState(state.map) : loadMapStateFromLegacy();
  if (mapLoaded) {
    if (currentAccount?.role === "player") setMapRole("player", false);
    stageHint?.classList.add("is-hidden");
    updateLegend();
    updateSeedDisplay();
    redraw();
    setStatus("Карта загружена из SQLite.");
    showToast("SQLite подключён");
  } else if (canRegenerateMap(currentAccount)) {
    regenerateMap({ toast: false, switchToRooms: false });
    void saveMapState();
    setStatus("Отряд в комнате 1. Данные хранятся в SQLite.");
    showToast("SQLite подключён");
  } else {
    stageHint?.classList.remove("is-hidden");
    setStatus("Дождитесь, пока мастер сгенерирует карту, или войдите как мастер.");
  }
}

void boot();
