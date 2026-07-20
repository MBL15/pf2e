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
 */

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
    obstacleLabel: "Завал / корень",
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
    obstacleLabel: "Ящик / телега",
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
    obstacleLabel: "Обломок / руина",
  },
};

const MIN_ROOM_AREA = 20;
/** Стартовая комната — квадрат с площадью ≥ MIN_ROOM_AREA */
const START_ROOM_SIZE = Math.ceil(Math.sqrt(MIN_ROOM_AREA)); // 5 → 25 клеток
const PADDING = 3;
const GAP_MIN = 3;
const GAP_MAX = 6;
const MAX_BRANCHES = 3; // сколько выходов может быть у обычной комнаты

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
 * Случайный размер комнаты с площадью ≥ MIN_ROOM_AREA.
 * @param {number} size — базовый размер из слайдера
 * @param {{ bigger?: boolean }} [opts]
 * @returns {{w:number,h:number}}
 */
function rollRoomSize(size, opts = {}) {
  const bigger = !!opts.bigger;
  const maxSide = Math.max(START_ROOM_SIZE, size + (bigger ? 3 : 2));
  // Нижняя грань стороны, при которой ещё возможна площадь ≥ MIN_ROOM_AREA
  const minSide = Math.max(
    4,
    Math.ceil(MIN_ROOM_AREA / maxSide)
  );
  for (let attempt = 0; attempt < 40; attempt++) {
    const w = randInt(minSide, maxSide);
    const h = randInt(minSide, maxSide);
    if (w * h >= MIN_ROOM_AREA) return { w, h };
  }
  // Гарантия площади ≥ 20
  const w = Math.max(minSide, Math.ceil(Math.sqrt(MIN_ROOM_AREA)));
  const h = Math.max(minSide, Math.ceil(MIN_ROOM_AREA / w));
  return { w, h };
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
      // Вход отряда — квадрат с площадью ≥ MIN_ROOM_AREA
      sizes.push({ w: START_ROOM_SIZE, h: START_ROOM_SIZE });
    } else {
      sizes.push(rollRoomSize(size, { bigger: i === count - 1 }));
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
      // Аварийное размещение рядом с любой комнатой
      for (const parent of shuffle(rooms)) {
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

  // Пол
  for (const room of rooms) {
    carveRoomFloor(grid, room);
    if (room.role !== "start" && rng() < 0.5) {
      const fx = room.cx + randInt(-1, 1);
      const fy = room.cy + randInt(-1, 1);
      if (grid[fy]?.[fx] === "floor") grid[fy][fx] = "feature";
    }
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

  placeDoorsOnLinks(grid, rooms, links);

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
 * Родители для новой комнаты: предпочитаем комнаты с малым числом детей (ветвление).
 * Для финальной — любой не-лист с свободным слотом, но только один вход.
 * @param {Room[]} rooms
 * @param {Map<number, number>} childCount
 * @param {boolean} forEnd
 */
function pickParentCandidates(rooms, childCount, forEnd) {
  const eligible = rooms.filter((r) => {
    if (r.role === "end") return false;
    const kids = childCount.get(r.id) || 0;
    if (forEnd) return kids < MAX_BRANCHES;
    // Старт и ранние комнаты чаще ветвятся
    if (r.role === "start") return kids < MAX_BRANCHES;
    return kids < MAX_BRANCHES;
  });

  // Сортируем: меньше детей → выше шанс стать развилкой; лёгкий рандом
  return shuffle(eligible).sort((a, b) => {
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
    else x = parent.cx - Math.floor(w / 2) + randInt(-2, 2);

    if (d.dy > 0) y = parent.y + parent.h + gap;
    else if (d.dy < 0) y = parent.y - gap - h;
    else y = parent.cy - Math.floor(h / 2) + randInt(-2, 2);

    // Доп. сдвиги вдоль направления
    for (const jitter of [0, -gap, gap, -gap * 2, gap * 2]) {
      const jx = d.dy !== 0 ? x + jitter : x;
      const jy = d.dx !== 0 ? y + jitter : y;
      list.push({ x: jx, y: jy });
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
  const w = size.w;
  const h = size.h;
  rooms.push({
    id,
    name:
      role === "start"
        ? "Комната 1 · вход"
        : role === "end"
          ? `Комната ${id + 1} · тупик`
          : `Комната ${id + 1}`,
    x,
    y,
    w,
    h,
    cx: Math.floor(x + w / 2),
    cy: Math.floor(y + h / 2),
    role,
  });
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

  const horizFirst = rng() < 0.5;

  const stepX = () => {
    while (x !== to.x) {
      x += x < to.x ? 1 : -1;
      paintCorridorCell(grid, x, y, false);
    }
  };
  const stepY = () => {
    while (y !== to.y) {
      y += y < to.y ? 1 : -1;
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
}

/**
 * @param {Room} room
 * @param {number} tx
 * @param {number} ty
 */
function edgeToward(room, tx, ty) {
  const cx = room.cx;
  const cy = room.cy;
  const dx = tx - cx;
  const dy = ty - cy;
  const halfH = Math.max(0, Math.floor(room.h / 2) - 1);
  const halfW = Math.max(0, Math.floor(room.w / 2) - 1);

  if (Math.abs(dx) >= Math.abs(dy)) {
    const x = dx >= 0 ? room.x + room.w - 1 : room.x;
    const y = clamp(cy + Math.sign(dy || 0) * Math.min(halfH, Math.abs(dy)), room.y, room.y + room.h - 1);
    return { x, y };
  }
  const y = dy >= 0 ? room.y + room.h - 1 : room.y;
  const x = clamp(cx + Math.sign(dx || 0) * Math.min(halfW, Math.abs(dx)), room.x, room.x + room.w - 1);
  return { x, y };
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
 * @param {CellType[][]} grid
 * @param {Room[]} rooms
 * @param {{from:number,to:number}[]} links
 */
function placeDoorsOnLinks(grid, rooms, links) {
  for (const link of links) {
    const a = rooms.find((r) => r.id === link.from);
    const b = rooms.find((r) => r.id === link.to);
    if (a && b) placeDoorAtLink(grid, a, b);
  }
}

/**
 * @param {CellType[][]} grid
 * @param {Room} a
 * @param {Room} b
 */
function placeDoorAtLink(grid, a, b) {
  const from = edgeToward(a, b.cx, b.cy);
  const to = edgeToward(b, a.cx, a.cy);

  /** @type {{x:number,y:number,room:Room}[]} */
  const candidates = [];
  for (const room of [a, b]) {
    for (let y = room.y - 1; y <= room.y + room.h; y++) {
      for (let x = room.x - 1; x <= room.x + room.w; x++) {
        if (!grid[y]?.[x]) continue;
        if (grid[y][x] !== "corridor") continue;
        const touchesFloor = [
          grid[y - 1]?.[x],
          grid[y + 1]?.[x],
          grid[y]?.[x - 1],
          grid[y]?.[x + 1],
        ].some((t) => t === "floor" || t === "feature");
        if (touchesFloor) candidates.push({ x, y, room });
      }
    }
  }

  candidates.sort((p, q) => {
    const dp = Math.min(dist(p, from), dist(p, to));
    const dq = Math.min(dist(q, from), dist(q, to));
    return dp - dq;
  });

  const usedRooms = new Set();
  for (const c of candidates) {
    if (usedRooms.has(c.room.id)) continue;
    grid[c.y][c.x] = "door";
    usedRooms.add(c.room.id);
    if (usedRooms.size >= 2) break;
  }
}

/**
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 */
function dist(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isWalkable(type) {
  return type === "floor" || type === "corridor" || type === "door" || type === "feature";
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
  return rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) ?? null;
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
