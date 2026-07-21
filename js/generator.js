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
 */

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
const MIN_ROOM_EXITS = 1;
const MAX_ROOM_EXITS = 3;

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
      const r = Math.floor(Math.min(room.w, room.h) / 2);
      return lx * lx + ly * ly <= r * r;
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

  for (let i = 1; i < count; i++) {
    const { w, h } = sizes[i];
    const isEnd = i === count - 1;
    const parents = pickParentCandidates(rooms, childCount, isEnd);
    let placed = false;

    for (const parent of parents) {
      const candidates = branchPlacementCandidates(parent, w, h, mapW, mapH);
      for (const cand of candidates) {
        if (!fits(cand.x, cand.y, w, h, mapW, mapH)) continue;
        if (overlapsAny(rooms, cand.x, cand.y, w, h, 2)) continue;
        const role = isEnd ? "end" : "path";
        placeRoom(rooms, { w, h }, cand.x, cand.y, i, role);
        links.push({ from: parent.id, to: i });
        childCount.set(parent.id, (childCount.get(parent.id) || 0) + 1);
        childCount.set(i, 0);
        placed = true;
        break;
      }
      if (placed) break;
    }

    if (!placed) {
      for (const parent of shuffle(rooms)) {
        if (parent.role === "end" || !canAddExit(parent, childCount)) continue;
        const candidates = branchPlacementCandidates(parent, w, h, mapW, mapH);
        for (const cand of candidates) {
          if (!fits(cand.x, cand.y, w, h, mapW, mapH)) continue;
          if (overlapsAny(rooms, cand.x, cand.y, w, h, 1)) continue;
          placeRoom(rooms, { w, h }, cand.x, cand.y, i, isEnd ? "end" : "path");
          links.push({ from: parent.id, to: i });
          childCount.set(parent.id, (childCount.get(parent.id) || 0) + 1);
          childCount.set(i, 0);
          placed = true;
          break;
        }
        if (placed) break;
      }
    }
  }

  for (const room of rooms) {
    carveRoomFloor(grid, room);
  }

  // Коридоры только по дереву связей (последняя — лист)
  for (const link of links) {
    const a = rooms.find((r) => r.id === link.from);
    const b = rooms.find((r) => r.id === link.to);
    if (a && b) carveCorridorBetween(grid, a, b);
  }

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
 * Число выходов комнаты (связей с соседними комнатами).
 * @param {Room} room
 * @param {Map<number, number>} childCount
 */
function roomExitCount(room, childCount) {
  const incoming = room.role === "start" ? 0 : 1;
  return incoming + (childCount.get(room.id) || 0);
}

/**
 * @param {Room} room
 * @param {Map<number, number>} childCount
 */
function canAddExit(room, childCount) {
  return roomExitCount(room, childCount) < MAX_ROOM_EXITS;
}

/**
 * Родители для новой комнаты: у каждой комнаты итого от 1 до 3 выходов.
 * @param {Room[]} rooms
 * @param {Map<number, number>} childCount
 * @param {boolean} forEnd
 */
function pickParentCandidates(rooms, childCount, forEnd) {
  const eligible = rooms.filter((r) => {
    if (r.role === "end") return false;
    return canAddExit(r, childCount);
  });

  return shuffle(eligible).sort((a, b) => {
    if (a.role === "start" && b.role !== "start") return -1;
    if (b.role === "start" && a.role !== "start") return 1;
    const ea = roomExitCount(a, childCount);
    const eb = roomExitCount(b, childCount);
    if (ea !== eb) return eb - ea;
    const ca = childCount.get(a.id) || 0;
    const cb = childCount.get(b.id) || 0;
    if (ca !== cb) return ca - cb;
    return rng() - 0.5;
  });
}

/**
 * Кандидаты размещения во все 4 стороны + диагональные сдвиги.
 * @param {Room} parent
 * @param {number} w
 * @param {number} h
 * @param {number} mapW
 * @param {number} mapH
 */
function branchPlacementCandidates(parent, w, h, mapW, mapH) {
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

  /** @type {{x:number,y:number}[]} */
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

    list.push({ x, y });
    // Доп. сдвиги только для диагонального размещения
    if (d.dx !== 0 && d.dy !== 0) {
      for (const jitter of [-gap, gap]) {
        list.push({ x: x + jitter, y: y + jitter });
      }
    }
  }

  return list.filter((c) => fits(c.x, c.y, w, h, mapW, mapH));
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
 * @param {Room} a
 * @param {Room} b
 */
function carveCorridorBetween(grid, a, b) {
  const from = edgeToward(a, b.cx, b.cy);
  const to = edgeToward(b, a.cx, a.cy);

  let x = from.x;
  let y = from.y;
  paintCorridorCell(grid, x, y, true);

  const outFrom = outwardCell(a, from);
  if (outFrom) {
    x = outFrom.x;
    y = outFrom.y;
    paintCorridorCell(grid, x, y, false);
  }

  const outTo = outwardCell(b, to);
  const targetX = outTo?.x ?? to.x;
  const targetY = outTo?.y ?? to.y;

  const horizFirst = rng() < 0.5;

  const stepX = () => {
    while (x !== targetX) {
      x += x < targetX ? 1 : -1;
      paintCorridorCell(grid, x, y, false);
    }
  };
  const stepY = () => {
    while (y !== targetY) {
      y += y < targetY ? 1 : -1;
      paintCorridorCell(grid, x, y, false);
    }
  };

  if (horizFirst) {
    stepX();
    stepY();
  } else {
    stepY();
    stepX();
  }

  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    paintCorridorCell(grid, x, y, false);
  }
  while (y !== to.y) {
    y += y < to.y ? 1 : -1;
    paintCorridorCell(grid, x, y, false);
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
 * @param {Room} room
 * @param {'n'|'s'|'e'|'w'} dir
 */
function wallExitAtSide(room, dir) {
  let x;
  let y;
  switch (dir) {
    case "e":
      x = room.x + room.w - 1;
      y = room.cy;
      break;
    case "w":
      x = room.x;
      y = room.cy;
      break;
    case "s":
      x = room.cx;
      y = room.y + room.h - 1;
      break;
    default:
      x = room.cx;
      y = room.y;
      break;
  }
  if (isInRoomShape(room, x, y)) return { x, y };

  /** @type {{x:number,y:number}[]} */
  const candidates = [];
  if (dir === "e" || dir === "w") {
    const wx = dir === "e" ? room.x + room.w - 1 : room.x;
    for (let yy = room.y; yy < room.y + room.h; yy++) {
      if (isInRoomShape(room, wx, yy)) candidates.push({ x: wx, y: yy });
    }
  } else {
    const hy = dir === "s" ? room.y + room.h - 1 : room.y;
    for (let xx = room.x; xx < room.x + room.w; xx++) {
      if (isInRoomShape(room, xx, hy)) candidates.push({ x: xx, y: hy });
    }
  }
  if (candidates.length === 0) return { x: room.cx, y: room.cy };
  const target = dir === "e" || dir === "w" ? room.cy : room.cx;
  candidates.sort((a, b) => {
    const ca = dir === "e" || dir === "w" ? Math.abs(a.y - target) : Math.abs(a.x - target);
    const cb = dir === "e" || dir === "w" ? Math.abs(b.y - target) : Math.abs(b.x - target);
    return ca - cb;
  });
  return candidates[0];
}

/**
 * Точка выхода — геометрический центр стены, обращённой к цели.
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
 * @param {boolean} allowOnFloor
 */
function paintCorridorCell(grid, x, y, allowOnFloor) {
  if (!grid[y] || grid[y][x] === undefined) return;
  const cell = grid[y][x];
  if (cell === "floor" || cell === "feature" || cell === "obstacle") {
    if (!allowOnFloor) return;
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
  const edge = edgeToward(room, other.cx, other.cy);
  const door = findDoorCellAtEdge(grid, room, edge);
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
 * Первая клетка коридора/двери у точки выхода комнаты.
 * @param {CellType[][]} grid
 * @param {Room} room
 * @param {{x:number,y:number}} edge
 * @returns {{x:number,y:number} | null}
 */
function findDoorCellAtEdge(grid, room, edge) {
  const outward = outwardCell(room, edge);
  if (outward && isDoorwayCell(grid[outward.y]?.[outward.x])) {
    return outward;
  }

  for (const [nx, ny] of outwardDirs(room, edge)) {
    if (isDoorwayCell(grid[ny]?.[nx])) return { x: nx, y: ny };
  }

  for (const [nx, ny] of [
    [edge.x, edge.y - 1],
    [edge.x, edge.y + 1],
    [edge.x - 1, edge.y],
    [edge.x + 1, edge.y],
  ]) {
    if (nx >= room.x && nx < room.x + room.w && ny >= room.y && ny < room.y + room.h) {
      continue;
    }
    if (isDoorwayCell(grid[ny]?.[nx])) return { x: nx, y: ny };
  }

  /** @type {{x:number,y:number,d:number}[]} */
  const queue = [{ x: edge.x, y: edge.y, d: 0 }];
  const seen = new Set([`${edge.x},${edge.y}`]);
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || cur.d > 2) continue;
    for (const [nx, ny] of [
      [cur.x, cur.y - 1],
      [cur.x, cur.y + 1],
      [cur.x - 1, cur.y],
      [cur.x + 1, cur.y],
    ]) {
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const type = grid[ny]?.[nx];
      if (isDoorwayCell(type)) return { x: nx, y: ny };
      if (type === "wall") queue.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
  return null;
}

/**
 * @param {Room} room
 * @param {{x:number,y:number}} edge
 * @returns {[number, number][]}
 */
function outwardDirs(room, edge) {
  const out = outwardCell(room, edge);
  if (!out) return [];
  return [[out.x, out.y]];
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
 * @param {Record<string, boolean> | null | undefined} doorStates
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
      const door = findDoorCellAtEdge(grid, room, edgeToward(room, other.cx, other.cy));
      if (!door || !isDoorwayCell(grid[door.y]?.[door.x])) continue;
      const key = `${door.x},${door.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      doors.push(door);
    }
  }
  return doors;
}
