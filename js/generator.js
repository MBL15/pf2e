/** @typedef {'forest' | 'city' | 'dungeon'} SettingId */
/** @typedef {'empty' | 'floor' | 'wall' | 'corridor' | 'door' | 'feature' | 'obstacle'} CellType */

/**
 * @typedef {Object} Theme
 * @property {string} id
 * @property {string} name
 * @property {string} floor
 * @property {string} floorAlt
 * @property {string} wall
 * @property {string} wallTop
 * @property {string} corridor
 * @property {string} door
 * @property {string} feature
 * @property {string} obstacle
 * @property {string} grid
 * @property {string} bg
 * @property {string} featureLabel
 * @property {string} obstacleLabel
 */

/**
 * @typedef {'rect'|'circle'|'hex'|'cross'|'diamond'|'L'} RoomShape
 * @typedef {Object} Room
 * @property {number} id
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} cx
 * @property {number} cy
 * @property {'start'|'path'|'end'} role
 * @property {RoomShape} shape
 * @property {number} [shapeVariant]
 * @property {'n'|'s'|'e'|'w' | null} [entranceSide]
 */

/** @typedef {'n'|'s'|'e'|'w'} WallSide */

/** @type {Record<RoomShape, string>} */
export const ROOM_SHAPE_LABELS = {
  rect: "прямоуг.",
  circle: "круг",
  hex: "гекс",
  cross: "крест",
  diamond: "ромб",
  L: "Г-образ.",
};

/** @type {Record<SettingId, Theme>} */
export const THEMES = {
  forest: {
    id: "forest",
    name: "Лес",
    floor: "#3f5e38",
    floorAlt: "#355232",
    wall: "#1e2e1a",
    wallTop: "#2a4024",
    corridor: "#4a6b3f",
    door: "#6b4a28",
    feature: "#7a9a4a",
    obstacle: "#5a4028",
    grid: "rgba(20, 30, 16, 0.25)",
    bg: "#121a10",
    featureLabel: "Чаща / пень",
    obstacleLabel: "Дерево / куст",
  },
  city: {
    id: "city",
    name: "Средневековый город",
    floor: "#8a7a62",
    floorAlt: "#7a6a54",
    wall: "#4a4036",
    wallTop: "#5c5044",
    corridor: "#9a8a70",
    door: "#6e4e32",
    feature: "#b09060",
    obstacle: "#6a4a30",
    grid: "rgba(40, 32, 24, 0.28)",
    bg: "#1a1612",
    featureLabel: "Лавка / колодец",
    obstacleLabel: "Ящик / бочка",
  },
  dungeon: {
    id: "dungeon",
    name: "Подземелье",
    floor: "#5a5650",
    floorAlt: "#4e4a44",
    wall: "#2a2826",
    wallTop: "#3a3834",
    corridor: "#646058",
    door: "#7a5a3a",
    feature: "#8a6a4a",
    obstacle: "#3a3834",
    grid: "rgba(10, 10, 10, 0.35)",
    bg: "#0e0d0c",
    featureLabel: "Колонна / алтарь",
    obstacleLabel: "Камень / колонна",
  },
};

/** @typedef {{ id: number, label: string }} ObstacleTypeDef */

/** @type {Record<SettingId, ObstacleTypeDef[]>} */
export const OBSTACLE_TYPES = {
  forest: [
    { id: 0, label: "Дерево" },
    { id: 1, label: "Ель" },
    { id: 2, label: "Куст" },
  ],
  city: [
    { id: 0, label: "Ящик" },
    { id: 1, label: "Бочка" },
    { id: 2, label: "Телега" },
  ],
  dungeon: [
    { id: 0, label: "Камни" },
    { id: 1, label: "Колонна" },
    { id: 2, label: "Сталагмит" },
  ],
};

const MIN_ROOM_AREA = 20;
/** Стартовая комната — квадрат с площадью ≥ MIN_ROOM_AREA */
const START_ROOM_SIZE = Math.ceil(Math.sqrt(MIN_ROOM_AREA)); // 5 → 25 клеток
const PADDING = 3;
const GAP_MIN = 3;
const GAP_MAX = 6;
/** Максимум исходящих выходов (к комнатам с бо́льшим номером), не со стороны входа */
const MAX_CHILD_EXITS = 3;
/** Вероятности целевого числа исходящих выходов: 3 → 60%, 2 → 25%, 1 → 15% */
const EXIT_COUNT_WEIGHTS = [
  { exits: 3, weight: 0.6 },
  { exits: 2, weight: 0.25 },
  { exits: 1, weight: 0.15 },
];
/** Клеток коридора строго от стены наружу, прежде чем поворачивать */
const CORRIDOR_STUB = 2;

/** @type {() => number} */
let rng = Math.random;

/**
 * Mulberry32 — детерминированный ГПСЧ по сиду.
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} [seed]
 * @returns {number}
 */
function normalizeSeed(seed) {
  if (seed == null || Number.isNaN(Number(seed))) {
    return (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
  }
  return Number(seed) >>> 0;
}

/**
 * @param {number} min
 * @param {number} max
 */
function randInt(min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * @param {number} n
 * @returns {number}
 */
function toOdd(n) {
  const v = Math.max(3, Math.round(n));
  return v % 2 === 0 ? v + 1 : v;
}

/**
 * Случайный размер комнаты с площадью ≥ MIN_ROOM_AREA; стороны всегда нечётные.
 * @param {number} size — базовый размер из слайдера
 * @param {{ bigger?: boolean }} [opts]
 * @returns {{w:number,h:number}}
 */
function rollRoomSize(size, opts = {}) {
  const bigger = !!opts.bigger;
  const maxSide = toOdd(Math.max(START_ROOM_SIZE, size + (bigger ? 3 : 2)));
  const minSide = toOdd(
    Math.max(5, Math.ceil(Math.sqrt(MIN_ROOM_AREA / maxSide)))
  );
  for (let attempt = 0; attempt < 40; attempt++) {
    const w = toOdd(randInt(minSide, maxSide));
    const h = toOdd(randInt(minSide, maxSide));
    if (w * h >= MIN_ROOM_AREA) return { w, h };
  }
  const w = toOdd(Math.max(minSide, Math.ceil(Math.sqrt(MIN_ROOM_AREA))));
  const h = toOdd(Math.max(minSide, Math.ceil(MIN_ROOM_AREA / w)));
  return { w, h };
}

/**
 * @param {'start'|'path'|'end'} role
 * @param {number} id
 * @returns {RoomShape}
 */
function pickRoomShape(role, id) {
  if (role === "start") return "rect";
  if (role === "end") return "circle";
  /** @type {RoomShape[]} */
  const pool = ["rect", "hex", "cross", "diamond", "L"];
  return pool[randInt(0, pool.length - 1)];
}

/**
 * @param {Room} room
 * @param {number} gx
 * @param {number} gy
 */
export function isInRoomShape(room, gx, gy) {
  if (gx < room.x || gx >= room.x + room.w || gy < room.y || gy >= room.y + room.h) {
    return false;
  }
  const lx = gx - room.cx;
  const ly = gy - room.cy;
  const mx = gx - room.x;
  const my = gy - room.y;

  switch (room.shape) {
    case "circle": {
      const mx = gx - (room.x + Math.floor(room.w / 2));
      const my = gy - (room.y + Math.floor(room.h / 2));
      const r = Math.floor(Math.min(room.w, room.h) / 2);
      return mx * mx + my * my <= r * r;
    }
    case "hex": {
      const R = Math.floor(Math.min(room.w, room.h) / 2);
      const q = lx;
      const r = ly - Math.trunc((lx - (lx & 1)) / 2);
      return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= R;
    }
    case "cross": {
      const arm = Math.max(1, Math.floor(Math.min(room.w, room.h) / 4));
      const cx = Math.floor(room.w / 2);
      const cy = Math.floor(room.h / 2);
      return Math.abs(mx - cx) <= arm || Math.abs(my - cy) <= arm;
    }
    case "diamond": {
      const rx = Math.max(1, Math.floor(room.w / 2));
      const ry = Math.max(1, Math.floor(room.h / 2));
      return Math.abs(lx) / rx + Math.abs(ly) / ry <= 1;
    }
    case "L": {
      const hw = Math.floor(room.w / 2) + 1;
      const hh = Math.floor(room.h / 2) + 1;
      const v = room.shapeVariant ?? 0;
      if (v === 0) return (mx < hw && my >= room.h - hh) || (mx >= room.w - hw && my < hh);
      if (v === 1) return (mx < hw && my < hh) || (mx >= room.w - hw && my >= room.h - hh);
      if (v === 2) return (mx < hw && my < hh) || (mx >= room.w - hw && my < hh);
      return (mx < hw && my >= room.h - hh) || (mx >= room.w - hw && my >= room.h - hh);
    }
    default:
      return true;
  }
}

/**
 * @param {unknown[]} arr
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Ветвящееся подземелье-дерево:
 * — комната 1 — вход отряда (площадь ≥ MIN_ROOM_AREA);
 * — дальше ответвления в разные стороны;
 * — последняя по номеру — тупик с одним входом и без выходов.
 * @param {Object} opts
 * @param {number} opts.roomCount
 * @param {number} opts.roomSize
 * @param {SettingId} opts.setting
 * @param {number} [opts.seed]
 */
export function generateDungeon({ roomCount, roomSize, setting, seed }) {
  const usedSeed = normalizeSeed(seed);
  rng = createRng(usedSeed);

  const count = Math.max(2, Math.min(16, Number(roomCount) || 7));
  const size = Math.max(3, Math.min(10, Number(roomSize) || 5));

  /** @type {{w:number,h:number}[]} */
  const sizes = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      sizes.push({ w: START_ROOM_SIZE, h: START_ROOM_SIZE });
    } else if (i === count - 1) {
      const side = toOdd(Math.max(size + 2, 7));
      sizes.push({ w: side, h: side });
    } else {
      sizes.push(rollRoomSize(size));
    }
  }

  // Запас под ветвление во все стороны
  const mapW = Math.max(48, PADDING * 2 + Math.ceil(Math.sqrt(count)) * (size + GAP_MAX + 4) * 2 + 16);
  const mapH = Math.max(40, PADDING * 2 + Math.ceil(Math.sqrt(count)) * (size + GAP_MAX + 4) * 2 + 12);

  /** @type {CellType[][]} */
  let grid = Array.from({ length: mapH }, () => Array(mapW).fill("empty"));

  /** @type {Room[]} */
  const rooms = [];
  /** @type {{from:number,to:number}[]} */
  const links = [];
  /** @type {Map<number, number>} */
  const childCount = new Map();

  // Старт по центру карты
  const startX = Math.floor((mapW - START_ROOM_SIZE) / 2);
  const startY = Math.floor((mapH - START_ROOM_SIZE) / 2);
  placeRoom(rooms, sizes[0], startX, startY, 0, "start");
  childCount.set(0, 0);
  /** @type {Map<number, Set<WallSide>>} */
  const exitSidesByRoom = new Map();

  const plannedLinks = planDungeonLinks(count);

  for (const link of plannedLinks) {
    const parent = rooms.find((r) => r.id === link.from);
    if (!parent) continue;
    const { w, h } = sizes[link.to];
    const isEnd = link.to === count - 1;
    if (
      tryConnectChildRoom(
        rooms,
        parent,
        w,
        h,
        link.to,
        isEnd ? "end" : "path",
        mapW,
        mapH,
        childCount,
        exitSidesByRoom,
        links,
        2
      )
    ) {
      continue;
    }

    let placed = false;
    /** @type {Room[]} */
    const fallbacks = shuffle(
      rooms.filter(
        (r) => r.id !== link.from && r.role !== "end" && canAddChildExit(r, childCount)
      )
    );
    for (const alt of fallbacks) {
      if (
        tryConnectChildRoom(
          rooms,
          alt,
          w,
          h,
          link.to,
          isEnd ? "end" : "path",
          mapW,
          mapH,
          childCount,
          exitSidesByRoom,
          links,
          1
        )
      ) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      for (const alt of shuffle(rooms)) {
        if (alt.role === "end" || !canAddChildExit(alt, childCount)) continue;
        if (
          tryConnectChildRoom(
            rooms,
            alt,
            w,
            h,
            link.to,
            isEnd ? "end" : "path",
            mapW,
            mapH,
            childCount,
            exitSidesByRoom,
            links,
            1
          )
        ) {
          break;
        }
      }
    }
  }

  for (const room of rooms) {
    carveRoomFloor(grid, room);
  }

  ensureEntranceSides(rooms, links);

  const doorwayOutwardCells = collectDoorwayOutwardCells(rooms, links);

  // Коридоры только по дереву связей (from — меньший id, to — больший)
  for (const link of links) {
    const a = rooms.find((r) => r.id === link.from);
    const b = rooms.find((r) => r.id === link.to);
    if (a && b) carveCorridorBetween(grid, a, b, rooms, doorwayOutwardCells);
  }

  sanitizeCorridorsAlongWalls(grid, rooms, doorwayOutwardCells);
  sealRoomPerimetersExceptDoorways(grid, rooms, doorwayOutwardCells);

  // Стены
  for (let y = 1; y < mapH - 1; y++) {
    for (let x = 1; x < mapW - 1; x++) {
      if (grid[y][x] !== "empty") continue;
      const near = neighbors(grid, x, y).some(
        (t) => t === "floor" || t === "corridor" || t === "feature" || t === "door" || t === "obstacle"
      );
      if (near) grid[y][x] = "wall";
    }
  }

  placeDoorsAtRoomExits(grid, rooms, links);

  // Обрезаем пустые края
  const cropped = cropDungeon(grid, rooms);
  grid = cropped.grid;

  return {
    width: cropped.width,
    height: cropped.height,
    grid,
    rooms: cropped.rooms,
    setting,
    theme: THEMES[setting],
    seed: usedSeed,
    startRoomId: 0,
    endRoomId: cropped.rooms[cropped.rooms.length - 1]?.id ?? 0,
    links,
  };
}

/**
 * @param {WallSide} side
 * @returns {WallSide}
 */
function oppositeSide(side) {
  return /** @type {WallSide} */ ({ n: "s", s: "n", e: "w", w: "e" }[side]);
}

/**
 * Сторона комнаты `from`, обращённая к центру `to`.
 * @param {{ cx: number, cy: number }} from
 * @param {{ cx: number, cy: number }} to
 * @returns {WallSide}
 */
function sideTowardRoom(from, to) {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "e" : "w") : dy >= 0 ? "s" : "n";
}

/**
 * @param {Room} room
 * @param {Map<number, number>} childCount
 */
function childExitCount(room, childCount) {
  return childCount.get(room.id) || 0;
}

/**
 * Можно ли добавить ещё один исходящий выход (к комнате с бо́льшим id).
 * @param {Room} room
 * @param {Map<number, number>} childCount
 */
function canAddChildExit(room, childCount) {
  return childExitCount(room, childCount) < MAX_CHILD_EXITS;
}

/**
 * @returns {1|2|3}
 */
function rollTargetExitCount() {
  const r = rng();
  let acc = 0;
  for (const { exits, weight } of EXIT_COUNT_WEIGHTS) {
    acc += weight;
    if (r < acc) return /** @type {1|2|3} */ (exits);
  }
  return 1;
}

/**
 * @param {{from:number,to:number}[]} links
 * @param {number} parentId
 */
function countLinkChildren(links, parentId) {
  return links.filter((l) => l.from === parentId).length;
}

/**
 * План связей: у каждой разветвляющейся комнаты 1–3 выхода (60% / 25% / 15%).
 * @param {number} count
 * @returns {{from:number,to:number}[]}
 */
function planDungeonLinks(count) {
  /** @type {{from:number,to:number}[]} */
  const planned = [];
  /** @type {Map<number, number>} */
  const targetExits = new Map([[0, rollTargetExitCount()]]);

  for (let childId = 1; childId < count; childId++) {
    const roomsLeft = count - childId;

    /** @type {number[]} */
    let candidates = [];
    for (const [pid, target] of targetExits) {
      const have = countLinkChildren(planned, pid);
      if (have < target && have < MAX_CHILD_EXITS) candidates.push(pid);
    }

    if (!candidates.length) {
      candidates = [...targetExits.keys()].filter(
        (pid) => countLinkChildren(planned, pid) < MAX_CHILD_EXITS
      );
    }
    if (!candidates.length) {
      candidates = [planned[planned.length - 1]?.from ?? 0];
    }

    candidates.sort((a, b) => {
      const ha = countLinkChildren(planned, a);
      const hb = countLinkChildren(planned, b);
      if (ha !== hb) return hb - ha;
      const ta = targetExits.get(a) || 1;
      const tb = targetExits.get(b) || 1;
      if (ta !== tb) return tb - ta;
      return a - b;
    });

    const parentId = candidates[0];
    planned.push({ from: parentId, to: childId });

    if (childId < count - 1) {
      let target = rollTargetExitCount();
      target = Math.min(target, roomsLeft);
      if (roomsLeft > 0 && target < 1) target = 1;
      targetExits.set(childId, target);
    }
  }

  return planned;
}

/**
 * @param {Room[]} rooms
 * @param {Room} parent
 * @param {number} w
 * @param {number} h
 * @param {number} childId
 * @param {'start'|'path'|'end'} role
 * @param {number} mapW
 * @param {number} mapH
 * @param {Map<number, number>} childCount
 * @param {Map<number, Set<WallSide>>} exitSidesByRoom
 * @param {{from:number,to:number}[]} links
 * @param {number} overlapMargin
 * @returns {boolean}
 */
function tryConnectChildRoom(
  rooms,
  parent,
  w,
  h,
  childId,
  role,
  mapW,
  mapH,
  childCount,
  exitSidesByRoom,
  links,
  overlapMargin
) {
  if (parent.id >= childId) return false;
  if (!canAddChildExit(parent, childCount)) return false;

  const entranceSide = parent.entranceSide ?? null;
  const usedExitSides = exitSidesByRoom.get(parent.id) ?? new Set();
  const candidates = branchPlacementCandidates(parent, w, h, mapW, mapH, {
    entranceSide,
    usedExitSides,
  });

  for (const cand of candidates) {
    if (!fits(cand.x, cand.y, w, h, mapW, mapH)) continue;
    if (overlapsAny(rooms, cand.x, cand.y, w, h, overlapMargin)) continue;

    placeRoom(rooms, { w, h }, cand.x, cand.y, childId, role);
    const child = rooms[rooms.length - 1];
    const exitSide = sideTowardRoom(parent, child);
    if (exitSide === entranceSide) {
      rooms.pop();
      continue;
    }

    child.entranceSide = oppositeSide(exitSide);
    if (!exitSidesByRoom.has(parent.id)) exitSidesByRoom.set(parent.id, new Set());
    exitSidesByRoom.get(parent.id).add(exitSide);

    links.push({ from: parent.id, to: childId });
    childCount.set(parent.id, childExitCount(parent, childCount) + 1);
    childCount.set(childId, 0);
    return true;
  }
  return false;
}

/**
 * Кандидаты размещения: только стороны, отличные от входа; предпочитаем ещё не занятые стороны.
 * @param {Room} parent
 * @param {number} w
 * @param {number} h
 * @param {number} mapW
 * @param {number} mapH
 * @param {{ entranceSide?: WallSide | null, usedExitSides?: Set<WallSide> }} [opts]
 */
function branchPlacementCandidates(parent, w, h, mapW, mapH, opts = {}) {
  const entranceSide = opts.entranceSide ?? null;
  const usedExitSides = opts.usedExitSides ?? new Set();
  const gap = randInt(GAP_MIN, GAP_MAX);
  const dirs = shuffle([
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: -1 },
  ]);

  /** @type {{x:number,y:number,side:WallSide}[]} */
  const list = [];
  for (const d of dirs) {
    let x;
    let y;
    if (d.dx > 0) x = parent.x + parent.w + gap;
    else if (d.dx < 0) x = parent.x - gap - w;
    else x = parent.cx - Math.floor(w / 2);

    if (d.dy > 0) y = parent.y + parent.h + gap;
    else if (d.dy < 0) y = parent.y - gap - h;
    else y = parent.cy - Math.floor(h / 2);

    const side = sideTowardRoom(parent, {
      cx: x + Math.floor(w / 2),
      cy: y + Math.floor(h / 2),
    });
    if (side === entranceSide) continue;

    list.push({ x, y, side });
    if (d.dx !== 0 && d.dy !== 0) {
      for (const jitter of [-gap, gap]) {
        const jx = x + jitter;
        const jy = y + jitter;
        const jSide = sideTowardRoom(parent, {
          cx: jx + Math.floor(w / 2),
          cy: jy + Math.floor(h / 2),
        });
        if (jSide === entranceSide) continue;
        list.push({ x: jx, y: jy, side: jSide });
      }
    }
  }

  const filtered = list.filter((c) => fits(c.x, c.y, w, h, mapW, mapH));
  filtered.sort((a, b) => {
    const au = usedExitSides.has(a.side) ? 1 : 0;
    const bu = usedExitSides.has(b.side) ? 1 : 0;
    if (au !== bu) return au - bu;
    return rng() - 0.5;
  });
  return filtered;
}

/**
 * Обрезать пустые края карты и сдвинуть координаты комнат.
 * @param {CellType[][]} grid
 * @param {Room[]} rooms
 */
function cropDungeon(grid, rooms) {
  const mapH = grid.length;
  const mapW = grid[0].length;
  let minX = mapW;
  let minY = mapH;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      if (grid[y][x] === "empty") continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (minX > maxX) {
    return { grid, rooms, width: mapW, height: mapH };
  }

  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(mapW - 1, maxX + pad);
  maxY = Math.min(mapH - 1, maxY + pad);

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  /** @type {CellType[][]} */
  const next = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => grid[minY + y][minX + x])
  );

  const nextRooms = rooms.map((r) => ({
    ...r,
    x: r.x - minX,
    y: r.y - minY,
    cx: r.cx - minX,
    cy: r.cy - minY,
  }));

  return { grid: next, rooms: nextRooms, width, height };
}

/**
 * Клетки стартовой комнаты 3×3 для расстановки отряда (по центру → наружу).
 * @param {{rooms: Room[]}} dungeon
 * @returns {{x:number,y:number}[]}
 */
export function getStartSpawnCells(dungeon) {
  const room = dungeon.rooms.find((r) => r.role === "start") || dungeon.rooms[0];
  if (!room) return [];
  const cells = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (!isInRoomShape(room, x, y)) continue;
      cells.push({ x, y });
    }
  }
  cells.sort((a, b) => {
    const da = Math.abs(a.x - room.cx) + Math.abs(a.y - room.cy);
    const db = Math.abs(b.x - room.cx) + Math.abs(b.y - room.cy);
    return da - db;
  });
  return cells;
}

/**
 * @param {Room[]} rooms
 * @param {{w:number,h:number}} size
 * @param {number} x
 * @param {number} y
 * @param {number} id
 * @param {'start'|'path'|'end'} role
 */
function placeRoom(rooms, size, x, y, id, role) {
  const w = toOdd(size.w);
  const h = toOdd(size.h);
  const shape = pickRoomShape(role, id);
  /** @type {Room} */
  const room = {
    id,
    name:
      role === "start"
        ? "Комната 1 · вход"
        : role === "end"
          ? `Комната ${id + 1} · босс`
          : `Комната ${id + 1}`,
    x,
    y,
    w,
    h,
    cx: 0,
    cy: 0,
    role,
    shape,
    shapeVariant: id % 4,
    entranceSide: role === "start" ? null : undefined,
  };
  const center = computeRoomCenter(room);
  room.cx = center.cx;
  room.cy = center.cy;
  rooms.push(room);
}

/**
 * Центр масс пола комнаты (для нестандартных форм).
 * @param {Room} room
 */
function computeRoomCenter(room) {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (!isInRoomShape(room, x, y)) continue;
      sx += x;
      sy += y;
      n += 1;
    }
  }
  if (!n) {
    return {
      cx: room.x + Math.floor(room.w / 2),
      cy: room.y + Math.floor(room.h / 2),
    };
  }
  return { cx: Math.round(sx / n), cy: Math.round(sy / n) };
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} mapW
 * @param {number} mapH
 */
function fits(x, y, w, h, mapW, mapH) {
  return x >= PADDING && y >= PADDING && x + w <= mapW - PADDING && y + h <= mapH - PADDING;
}

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 */
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * @param {Room[]} rooms
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} margin
 */
function overlapsAny(rooms, x, y, w, h, margin) {
  return rooms.some(
    (r) =>
      x < r.x + r.w + margin &&
      x + w + margin > r.x &&
      y < r.y + r.h + margin &&
      y + h + margin > r.y
  );
}

/**
 * @param {CellType[][]} grid
 * @param {Room} room
 */
function carveRoomFloor(grid, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (!isInRoomShape(room, x, y)) continue;
      if (grid[y]?.[x] !== undefined) grid[y][x] = "floor";
    }
  }
}

/**
 * @param {CellType[][]} grid
 * @param {Room[]} rooms
 * @param {number} x
 * @param {number} y
 */
function isCorridorAdjacentToRoomFloor(grid, rooms, x, y) {
  for (const room of rooms) {
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (grid[ny]?.[nx] !== "floor") continue;
      if (isInRoomShape(room, nx, ny)) return true;
    }
  }
  return false;
}

/**
 * @param {Room[]} rooms
 * @param {{from:number,to:number}[]} links
 * @returns {Set<string>}
 */
function collectDoorwayOutwardCells(rooms, links) {
  /** @type {Set<string>} */
  const allowed = new Set();
  for (const link of links) {
    const a = rooms.find((r) => r.id === link.from);
    const b = rooms.find((r) => r.id === link.to);
    if (!a || !b) continue;
    for (const [room, other] of [
      [a, b],
      [b, a],
    ]) {
      const side = connectionSide(room, other);
      const edge = wallExitAtSide(room, side);
      const out = outwardFromSide(edge, side);
      allowed.add(`${out.x},${out.y}`);
    }
  }
  return allowed;
}

/**
 * Убрать коридоры, примыкающие к полу комнаты не в точке проёма.
 * @param {CellType[][]} grid
 * @param {Room[]} rooms
 * @param {Set<string>} doorwayOutwardCells
 */
function sanitizeCorridorsAlongWalls(grid, rooms, doorwayOutwardCells) {
  const mapH = grid.length;
  const mapW = grid[0].length;
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      if (grid[y][x] !== "corridor") continue;
      const key = `${x},${y}`;
      if (doorwayOutwardCells.has(key)) continue;
      if (isCorridorAdjacentToRoomFloor(grid, rooms, x, y)) {
        grid[y][x] = "empty";
      }
    }
  }
}

/**
 * @param {{x:number,y:number}} edge
 * @param {WallSide} side
 * @param {number} [stubLen]
 */
function corridorStubFromExit(edge, side, stubLen = CORRIDOR_STUB) {
  let x = outwardFromSide(edge, side).x;
  let y = outwardFromSide(edge, side).y;
  /** @type {{x:number,y:number}[]} */
  const cells = [{ x, y }];
  for (let i = 1; i < stubLen; i++) {
    switch (side) {
      case "n":
        y -= 1;
        break;
      case "s":
        y += 1;
        break;
      case "w":
        x -= 1;
        break;
      default:
        x += 1;
        break;
    }
    cells.push({ x, y });
  }
  return { x, y, cells };
}

/**
 * @param {CellType[][]} grid
 * @param {Room} a
 * @param {Room} b
 * @param {Room[]} rooms
 * @param {Set<string>} doorwayOutwardCells
 */
function carveCorridorBetween(grid, a, b, rooms, doorwayOutwardCells) {
  const sideA = connectionSide(a, b);
  const sideB = connectionSide(b, a);
  const edgeA = wallExitAtSide(a, sideA);
  const edgeB = wallExitAtSide(b, sideB);
  const stubA = corridorStubFromExit(edgeA, sideA);
  const stubB = corridorStubFromExit(edgeB, sideB);

  for (const c of stubA.cells) paintCorridorCell(grid, c.x, c.y, rooms, doorwayOutwardCells);
  for (const c of stubB.cells) paintCorridorCell(grid, c.x, c.y, rooms, doorwayOutwardCells);

  let x = stubA.x;
  let y = stubA.y;
  const targetX = stubB.x;
  const targetY = stubB.y;
  const horizFirst = rng() < 0.5;

  const stepX = () => {
    while (x !== targetX) {
      x += x < targetX ? 1 : -1;
      paintCorridorCell(grid, x, y, rooms, doorwayOutwardCells);
    }
  };
  const stepY = () => {
    while (y !== targetY) {
      y += y < targetY ? 1 : -1;
      paintCorridorCell(grid, x, y, rooms, doorwayOutwardCells);
    }
  };

  if (horizFirst) {
    stepX();
    stepY();
  } else {
    stepY();
    stepX();
  }
}

/**
 * @param {Room} room
 * @param {{x:number,y:number}} edge
 * @returns {{x:number,y:number} | null}
 */
function outwardCell(room, edge) {
  if (edge.x === room.x) return { x: edge.x - 1, y: edge.y };
  if (edge.x === room.x + room.w - 1) return { x: edge.x + 1, y: edge.y };
  if (edge.y === room.y) return { x: edge.x, y: edge.y - 1 };
  if (edge.y === room.y + room.h - 1) return { x: edge.x, y: edge.y + 1 };
  const dx = edge.x - room.cx;
  const dy = edge.y - room.cy;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: edge.x + (dx >= 0 ? 1 : -1), y: edge.y };
  return { x: edge.x, y: edge.y + (dy >= 0 ? 1 : -1) };
}

/**
 * @param {WallSide} dir
 */
function outwardStep(dir) {
  switch (dir) {
    case "e":
      return { ox: 1, oy: 0 };
    case "w":
      return { ox: -1, oy: 0 };
    case "s":
      return { ox: 0, oy: 1 };
    default:
      return { ox: 0, oy: -1 };
  }
}

/**
 * Клетки пола на периметре комнаты с данной стороны (для круга — «плоская» грань, не весь bbox).
 * @param {Room} room
 * @param {WallSide} dir
 * @returns {{x:number,y:number}[]}
 */
function wallCellsOnSide(room, dir) {
  const { ox, oy } = outwardStep(dir);
  /** @type {{x:number,y:number}[]} */
  let cells = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (!isInRoomShape(room, x, y)) continue;
      if (isInRoomShape(room, x + ox, y + oy)) continue;
      cells.push({ x, y });
    }
  }
  if (!cells.length) return [{ x: room.cx, y: room.cy }];
  if (dir === "n") {
    const edgeY = Math.min(...cells.map((c) => c.y));
    cells = cells.filter((c) => c.y === edgeY);
  } else if (dir === "s") {
    const edgeY = Math.max(...cells.map((c) => c.y));
    cells = cells.filter((c) => c.y === edgeY);
  } else if (dir === "w") {
    const edgeX = Math.min(...cells.map((c) => c.x));
    cells = cells.filter((c) => c.x === edgeX);
  } else {
    const edgeX = Math.max(...cells.map((c) => c.x));
    cells = cells.filter((c) => c.x === edgeX);
  }
  if (dir === "e" || dir === "w") cells.sort((a, b) => a.y - b.y);
  else cells.sort((a, b) => a.x - b.x);
  return cells;
}

/**
 * Закрыть «лишние» коридоры у пола — только doorwayOutwardCells остаются проходами.
 * @param {CellType[][]} grid
 * @param {Room[]} rooms
 * @param {Set<string>} doorwayOutwardCells
 */
function sealRoomPerimetersExceptDoorways(grid, rooms, doorwayOutwardCells) {
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (grid[y]?.[x] !== "floor" || !isInRoomShape(room, x, y)) continue;
        for (const [dx, dy] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          const key = `${nx},${ny}`;
          if (doorwayOutwardCells.has(key)) continue;
          if (grid[ny]?.[nx] === "corridor") grid[ny][nx] = "empty";
        }
      }
    }
  }
}

/**
 * Центральная клетка пола на стороне комнаты (середина сегмента стены).
 * @param {Room} room
 * @param {WallSide} dir
 */
function wallExitAtSide(room, dir) {
  const wallCells = wallCellsOnSide(room, dir);
  return wallCells[Math.round((wallCells.length - 1) / 2)];
}

/**
 * Восстановить сторону входа у комнат (для старых сохранений).
 * @param {Room[]} rooms
 * @param {{from:number,to:number}[]} links
 */
function ensureEntranceSides(rooms, links) {
  for (const link of links) {
    if (link.from >= link.to) continue;
    const parent = rooms.find((r) => r.id === link.from);
    const child = rooms.find((r) => r.id === link.to);
    if (!parent || !child) continue;
    if (child.entranceSide == null) {
      child.entranceSide = oppositeSide(sideTowardRoom(parent, child));
    }
  }
}

/**
 * @param {Room} room
 * @param {Room} other
 * @returns {WallSide}
 */
function connectionSide(room, other) {
  if (room.id < other.id) return sideTowardRoom(room, other);
  if (room.id > other.id) return room.entranceSide ?? sideTowardRoom(room, other);
  return sideTowardRoom(room, other);
}

/**
 * Центр стены для связи двух комнат.
 * @param {Room} room
 * @param {Room} other
 * @returns {{x:number,y:number}}
 */
function connectionEdge(room, other) {
  return wallExitAtSide(room, connectionSide(room, other));
}

/**
 * Клетка снаружи комнаты по центру стены.
 * @param {{x:number,y:number}} edge
 * @param {WallSide} side
 */
function outwardFromSide(edge, side) {
  switch (side) {
    case "w":
      return { x: edge.x - 1, y: edge.y };
    case "e":
      return { x: edge.x + 1, y: edge.y };
    case "n":
      return { x: edge.x, y: edge.y - 1 };
    default:
      return { x: edge.x, y: edge.y + 1 };
  }
}

/**
 * @param {Room} room
 * @param {number} tx
 * @param {number} ty
 */
function edgeToward(room, tx, ty) {
  const dx = tx - room.cx;
  const dy = ty - room.cy;
  const dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "e" : "w") : dy >= 0 ? "s" : "n";
  return wallExitAtSide(room, dir);
}

/**
 * @param {CellType[][]} grid
 * @param {number} x
 * @param {number} y
 * @param {Room[]} rooms
 * @param {Set<string>} doorwayOutwardCells
 */
function paintCorridorCell(grid, x, y, rooms, doorwayOutwardCells) {
  if (!grid[y] || grid[y][x] === undefined) return;
  const cell = grid[y][x];
  if (cell === "floor" || cell === "feature" || cell === "obstacle") return;
  const key = `${x},${y}`;
  if (
    isCorridorAdjacentToRoomFloor(grid, rooms, x, y) &&
    !doorwayOutwardCells.has(key)
  ) {
    return;
  }
  grid[y][x] = "corridor";
}

/**
 * @param {CellType[][]} grid
 * @param {number} x
 * @param {number} y
 */
function neighbors(grid, x, y) {
  return [
    grid[y - 1]?.[x],
    grid[y + 1]?.[x],
    grid[y]?.[x - 1],
    grid[y]?.[x + 1],
  ].filter(Boolean);
}

/**
 * Ставит одну дверь на каждый выход комнаты (точка связи с коридором по links).
 * @param {CellType[][]} grid
 * @param {Room[]} rooms
 * @param {{from:number,to:number}[]} links
 */
function placeDoorsAtRoomExits(grid, rooms, links) {
  /** @type {Set<string>} */
  const placed = new Set();
  for (const link of links) {
    const a = rooms.find((r) => r.id === link.from);
    const b = rooms.find((r) => r.id === link.to);
    if (!a || !b) continue;
    placeDoorAtRoomConnection(grid, a, b, placed);
    placeDoorAtRoomConnection(grid, b, a, placed);
  }
}

/**
 * @param {CellType[][]} grid
 * @param {Room} room
 * @param {Room} other
 * @param {Set<string>} placed
 */
function placeDoorAtRoomConnection(grid, room, other, placed) {
  const side = connectionSide(room, other);
  const edge = wallExitAtSide(room, side);
  const door = findDoorCellAtEdge(grid, edge, side);
  if (!door) return;
  const key = `${door.x},${door.y}`;
  if (placed.has(key)) return;
  if (grid[door.y][door.x] !== "corridor") return;
  grid[door.y][door.x] = "door";
  placed.add(key);
}

/**
 * @param {CellType | undefined} type
 */
function isDoorwayCell(type) {
  return type === "corridor" || type === "door";
}

/**
 * Дверь только строго напротив центра стены — без смещения вдоль стены.
 * @param {CellType[][]} grid
 * @param {{x:number,y:number}} edge
 * @param {WallSide} side
 * @returns {{x:number,y:number} | null}
 */
function findDoorCellAtEdge(grid, edge, side) {
  const outward = outwardFromSide(edge, side);
  if (isDoorwayCell(grid[outward.y]?.[outward.x])) {
    return outward;
  }
  return null;
}

export function isWalkable(type) {
  return type === "floor" || type === "corridor" || type === "door" || type === "feature";
}

/** @typedef {{ axis: 'h' | 'v', roomSide: 'n' | 's' | 'e' | 'w' }} DoorOrientation */

/**
 * Ориентация двери: ось проёма и сторона комнаты.
 * @param {CellType[][]} grid
 * @param {number} x
 * @param {number} y
 * @returns {DoorOrientation}
 */
export function getDoorOrientation(grid, x, y) {
  const isRoomSide = (t) => t === "floor" || t === "feature";
  const n = grid[y - 1]?.[x];
  const s = grid[y + 1]?.[x];
  const w = grid[y]?.[x - 1];
  const e = grid[y]?.[x + 1];
  if (isRoomSide(n)) return { axis: "h", roomSide: "n" };
  if (isRoomSide(s)) return { axis: "h", roomSide: "s" };
  if (isRoomSide(w)) return { axis: "v", roomSide: "w" };
  if (isRoomSide(e)) return { axis: "v", roomSide: "e" };
  return { axis: "h", roomSide: "s" };
}

/**
 * @param {CellType[][]} grid
 * @param {number} x
 * @param {number} y
 * @param {Record<string, boolean> | null | undefined} [doorStates]
 */
export function isCellWalkable(grid, x, y, doorStates) {
  const type = grid[y]?.[x];
  if (!type) return false;
  if (type === "door") return doorStates?.[`${x},${y}`] === true;
  return isWalkable(type);
}

/** @param {Record<string, boolean> | null | undefined} doorStates @param {number} x @param {number} y */
export function isDoorOpen(doorStates, x, y) {
  return doorStates?.[`${x},${y}`] === true;
}

/** Cells where an obstacle can be toggled inside a room. */
export function canPlaceObstacle(type) {
  return type === "floor" || type === "feature" || type === "obstacle";
}

/**
 * @param {{x:number,y:number,w:number,h:number}[]} rooms
 * @param {number} x
 * @param {number} y
 */
export function findRoomAt(rooms, x, y) {
  return (
    rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h && isInRoomShape(r, x, y)) ??
    null
  );
}

/**
 * Клетки, видимые игроку: посещённые комнаты + коридоры от них + 1 клетка вглубь непосещённых.
 * @param {{ width:number, height:number, grid: string[][], rooms: {id:number,x:number,y:number,w:number,h:number}[] }} dungeon
 * @param {Iterable<number>} visitedRoomIds
 * @returns {Set<string>} ключи `"x,y"`
 */
export function computeVisibleCells(dungeon, visitedRoomIds) {
  const visited = new Set(visitedRoomIds);
  /** @type {Set<string>} */
  const visible = new Set();
  const { width, height, grid, rooms } = dungeon;
  const key = (x, y) => `${x},${y}`;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  /** @type {{x:number,y:number}[]} */
  const queue = [];

  for (const room of rooms) {
    if (!visited.has(room.id)) continue;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (!isInRoomShape(room, x, y)) continue;
        const k = key(x, y);
        if (visible.has(k)) continue;
        visible.add(k);
        queue.push({ x, y });
      }
    }
  }

  const seen = new Set(visible);

  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nk = key(nx, ny);
      if (seen.has(nk)) continue;
      const type = grid[ny]?.[nx];
      if (!type || type === "empty") continue;

      const room = findRoomAt(rooms, nx, ny);
      if (room && !visited.has(room.id)) {
        // Ровно 1 блок вглубь следующей (непосещённой) комнаты
        seen.add(nk);
        visible.add(nk);
        continue;
      }

      seen.add(nk);
      visible.add(nk);

      if (type === "corridor" || type === "door" || type === "floor" || type === "feature" || type === "obstacle") {
        queue.push({ x: nx, y: ny });
      }
    }
  }

  // Рамка стен вокруг видимого
  /** @type {string[]} */
  const wallFrame = [];
  for (const k of visible) {
    const [xs, ys] = k.split(",");
    const x = Number(xs);
    const y = Number(ys);
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (grid[ny]?.[nx] === "wall") wallFrame.push(key(nx, ny));
    }
  }
  for (const k of wallFrame) visible.add(k);

  return visible;
}

/**
 * Bounds around a room including a wall ring for focused view.
 * @param {{x:number,y:number,w:number,h:number}} room
 * @param {number} mapW
 * @param {number} mapH
 * @param {number} [margin]
 */
export function roomFocusBounds(room, mapW, mapH, margin = 1) {
  const x0 = Math.max(0, room.x - margin);
  const y0 = Math.max(0, room.y - margin);
  const x1 = Math.min(mapW, room.x + room.w + margin);
  const y1 = Math.min(mapH, room.y + room.h + margin);
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/**
 * Клетки дверей на всех связях комнаты (исходящие и входные).
 * @param {{ grid: CellType[][], rooms: Room[], links?: {from:number,to:number}[] }} dungeon
 * @param {number} roomId
 * @returns {{x:number,y:number}[]}
 */
export function getRoomConnectionDoors(dungeon, roomId) {
  const { grid, rooms, links = [] } = dungeon;
  /** @type {{x:number,y:number}[]} */
  const doors = [];
  const seen = new Set();

  for (const link of links) {
    if (link.from !== roomId && link.to !== roomId) continue;
    for (const roomSideId of [link.from, link.to]) {
      const otherId = roomSideId === link.from ? link.to : link.from;
      const room = rooms.find((r) => r.id === roomSideId);
      const other = rooms.find((r) => r.id === otherId);
      if (!room || !other) continue;
      const side = connectionSide(room, other);
      const door = findDoorCellAtEdge(grid, wallExitAtSide(room, side), side);
      if (!door || !isDoorwayCell(grid[door.y]?.[door.x])) continue;
      const key = `${door.x},${door.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      doors.push(door);
    }
  }
  return doors;
}
