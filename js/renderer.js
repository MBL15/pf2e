import { isWalkable, getDoorOrientation, isDoorOpen, roomFocusBounds, THEMES } from "./generator.js";

/**
 * @typedef {import('./characters.js').Character} Character
 * @typedef {import('./characters.js').TokenPlacement} TokenPlacement
 * @typedef {{
 *   selectedRoomId: number | null,
 *   openedRoomId: number | null,
 *   isoRotation?: number,
 *   zoom?: number,
 *   panX?: number,
 *   panY?: number,
 *   visibleCells?: Set<string> | null,
 *   visitedRoomIds?: Set<number> | null,
 *   selectedActorId?: string | null,
 *   obstacleVariants?: Record<string, number> | null,
 *   doorStates?: Record<string, boolean> | null,
 * }} ViewState
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Object} dungeon
 * @param {'top'|'iso'} view
 * @param {TokenPlacement[]} tokens
 * @param {Character[]} characters
 * @param {ViewState} [viewState]
 */
export function renderMap(canvas, dungeon, view, tokens, characters, viewState = { selectedRoomId: null, openedRoomId: null, isoRotation: 0 }) {
  const wrap = canvas.parentElement;
  const cssW = wrap?.clientWidth || 960;
  const cssH = wrap?.clientHeight || 640;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx || !dungeon) return null;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const theme = dungeon.theme;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, cssW, cssH);

  const openedRoom =
    viewState.openedRoomId != null
      ? dungeon.rooms.find((r) => r.id === viewState.openedRoomId) ?? null
      : null;
  const selectedRoom =
    viewState.selectedRoomId != null
      ? dungeon.rooms.find((r) => r.id === viewState.selectedRoomId) ?? null
      : null;
  const isoRotation = ((Number(viewState.isoRotation) % 4) + 4) % 4;
  const zoom = Math.max(0.4, Math.min(5, Number(viewState.zoom) || 1));
  const panX = Number(viewState.panX) || 0;
  const panY = Number(viewState.panY) || 0;
  const visibleCells = viewState.visibleCells ?? null;
  const visitedRoomIds = viewState.visitedRoomIds ?? null;
  const selectedActorId = viewState.selectedActorId ?? null;
  const obstacleVariants = viewState.obstacleVariants ?? null;
  const doorStates = viewState.doorStates ?? null;

  if (view === "iso") {
    return drawIsometric(
      ctx,
      dungeon,
      cssW,
      cssH,
      tokens,
      characters,
      selectedRoom,
      openedRoom,
      isoRotation,
      zoom,
      panX,
      panY,
      visibleCells,
      visitedRoomIds,
      selectedActorId,
      obstacleVariants,
      doorStates
    );
  }
  return drawTopDown(
    ctx,
    dungeon,
    cssW,
    cssH,
    tokens,
    characters,
    selectedRoom,
    openedRoom,
    zoom,
    panX,
    panY,
    visibleCells,
    visitedRoomIds,
    selectedActorId,
    obstacleVariants,
    doorStates
  );
}

/**
 * Смещение камеры, чтобы клетка (gx, gy) оказалась в центре экрана.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} dungeon
 * @param {'top'|'iso'} view
 * @param {ViewState} viewState
 * @param {number} gx
 * @param {number} gy
 * @returns {{ panX: number, panY: number } | null}
 */
export function computePanToCenterOnCell(canvas, dungeon, view, viewState, gx, gy) {
  if (!dungeon) return null;
  const wrap = canvas.parentElement;
  const cssW = wrap?.clientWidth || 960;
  const cssH = wrap?.clientHeight || 640;

  const openedRoom =
    viewState.openedRoomId != null
      ? dungeon.rooms.find((r) => r.id === viewState.openedRoomId) ?? null
      : null;
  const { width: mapW, height: mapH } = dungeon;
  const focus = openedRoom
    ? roomFocusBounds(openedRoom, mapW, mapH, 1)
    : { x0: 0, y0: 0, x1: mapW, y1: mapH, w: mapW, h: mapH };

  const zoom = Math.max(0.4, Math.min(5, Number(viewState.zoom) || 1));

  if (view === "top") {
    const pad = openedRoom ? 28 : 16;
    const fitCell = Math.min((cssW - pad * 2) / focus.w, (cssH - pad * 2) / focus.h);
    const cell = fitCell * zoom;
    const focusMidX = focus.x0 + focus.w / 2;
    const focusMidY = focus.y0 + focus.h / 2;
    return {
      panX: (focusMidX - gx - 0.5) * cell,
      panY: (focusMidY - gy - 0.5) * cell,
    };
  }

  const isoRotation = ((Number(viewState.isoRotation) % 4) + 4) % 4;
  const rot = isoRotation & 3;
  const viewW = rot % 2 === 0 ? focus.w : focus.h;
  const viewH = rot % 2 === 0 ? focus.h : focus.w;
  const span = viewW + viewH;

  const baseTileW = openedRoom
    ? Math.min(48, Math.max(22, (cssW * 0.85) / span * 1.5))
    : Math.min(28, Math.max(14, (cssW * 0.9) / span * 1.6));
  const tileW = baseTileW * zoom;
  const tileH = tileW * 0.5;
  const wallH = tileW * 0.55;

  const midX = viewW / 2;
  const midY = viewH / 2;
  const originX = cssW / 2;
  const originY = cssH * (openedRoom ? 0.18 : 0.12);

  const toView = (gridX, gridY) =>
    gridToView(gridX - focus.x0, gridY - focus.y0, rot, focus.w, focus.h);

  const toScreen = (vx, vy, z = 0) => ({
    sx: originX + (vx - midX - (vy - midY)) * (tileW / 2),
    sy: originY + (vx - midX + (vy - midY)) * (tileH / 2) - z,
  });

  const corners = [toScreen(0, 0), toScreen(viewW, 0), toScreen(0, viewH), toScreen(viewW, viewH)];
  const minY = Math.min(...corners.map((c) => c.sy));
  const maxY = Math.max(...corners.map((c) => c.sy)) + wallH;
  const yShift = (cssH - (maxY - minY)) / 2 - minY + 8;

  const v = toView(gx + 0.5, gy + 0.5);
  const p = toScreen(v.x, v.y, tileH * 0.35);

  return {
    panX: cssW / 2 - p.sx,
    panY: cssH / 2 - (p.sy + yShift),
  };
}

/**
 * @param {Set<string> | null | undefined} visibleCells
 * @param {number} x
 * @param {number} y
 */
function cellRevealed(visibleCells, x, y) {
  return !visibleCells || visibleCells.has(`${x},${y}`);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} dungeon
 * @param {number} cssW
 * @param {number} cssH
 * @param {TokenPlacement[]} tokens
 * @param {Character[]} characters
 * @param {Object | null} selectedRoom
 * @param {Object | null} openedRoom
 * @param {number} [zoom]
 * @param {number} [panX]
 * @param {number} [panY]
 * @param {Set<string> | null} [visibleCells]
 * @param {Set<number> | null} [visitedRoomIds]
 * @param {string | null} [selectedActorId]
 */
function drawTopDown(
  ctx,
  dungeon,
  cssW,
  cssH,
  tokens,
  characters,
  selectedRoom,
  openedRoom,
  zoom = 1,
  panX = 0,
  panY = 0,
  visibleCells = null,
  visitedRoomIds = null,
  selectedActorId = null,
  obstacleVariants = null,
  doorStates = null
) {
  const { width: mapW, height: mapH, grid, theme } = dungeon;
  const focus = openedRoom
    ? roomFocusBounds(openedRoom, mapW, mapH, 1)
    : { x0: 0, y0: 0, x1: mapW, y1: mapH, w: mapW, h: mapH };

  const pad = openedRoom ? 28 : 16;
  const fitCell = Math.min((cssW - pad * 2) / focus.w, (cssH - pad * 2) / focus.h);
  const cell = fitCell * zoom;
  const focusMidX = focus.x0 + focus.w / 2;
  const focusMidY = focus.y0 + focus.h / 2;
  const ox = cssW / 2 + panX - focusMidX * cell;
  const oy = cssH / 2 + panY - focusMidY * cell;

  // Dim outside focus when room is open
  if (openedRoom) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, cssW, cssH);
  }

  for (let y = focus.y0; y < focus.y1; y++) {
    for (let x = focus.x0; x < focus.x1; x++) {
      if (!cellRevealed(visibleCells, x, y)) continue;
      const type = grid[y][x];
      if (type === "empty") continue;

      const px = ox + x * cell;
      const py = oy + y * cell;
      ctx.fillStyle = cellColor(theme, type, x, y);
      ctx.fillRect(px, py, cell + 0.5, cell + 0.5);

      if (type === "wall") {
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.fillRect(px, py, cell + 0.5, cell * 0.22);
      }
      if (type === "obstacle") {
        const variant = obstacleVariants?.[`${x},${y}`];
        drawObstacle(ctx, px + cell / 2, py + cell / 2, cell * 0.48, theme, dungeon.setting, x, y, variant);
      }
    }
  }

  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  for (let y = focus.y0; y < focus.y1; y++) {
    for (let x = focus.x0; x < focus.x1; x++) {
      if (!cellRevealed(visibleCells, x, y)) continue;
      if (!isWalkable(grid[y][x])) continue;
      const px = ox + x * cell;
      const py = oy + y * cell;
      ctx.strokeRect(px, py, cell, cell);
    }
  }

  for (let y = focus.y0; y < focus.y1; y++) {
    for (let x = focus.x0; x < focus.x1; x++) {
      if (!cellRevealed(visibleCells, x, y)) continue;
      if (grid[y][x] !== "door") continue;
      const px = ox + x * cell;
      const py = oy + y * cell;
      const orient = getDoorOrientation(grid, x, y);
      drawDoorTopDown(ctx, px, py, cell, theme, isDoorOpen(doorStates, x, y), orient);
    }
  }

  // Room labels on overview — только посещённые в режиме игрока
  if (!openedRoom) {
    for (const room of dungeon.rooms) {
      if (visitedRoomIds && !visitedRoomIds.has(room.id)) continue;
      const cx = ox + (room.x + room.w / 2) * cell;
      const cy = oy + (room.y + room.h / 2) * cell;
      const isSel = selectedRoom && room.id === selectedRoom.id;
      ctx.font = `${isSel ? "700" : "600"} ${Math.max(10, cell * 0.55)}px Sora, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.fillStyle = isSel ? "#ffe6c8" : "rgba(243,230,208,0.85)";
      const label = String(room.id + 1);
      ctx.strokeText(label, cx, cy);
      ctx.fillText(label, cx, cy);
    }
  }

  let visibleTokens = openedRoom
    ? tokens.filter(
        (t) =>
          t.x >= focus.x0 && t.x < focus.x1 && t.y >= focus.y0 && t.y < focus.y1
      )
    : tokens;
  if (visibleCells) {
    visibleTokens = visibleTokens.filter((t) => cellRevealed(visibleCells, t.x, t.y));
  }

  for (const t of visibleTokens) {
    const ch = characters.find((c) => c.id === (t.actorId || t.characterId));
    if (!ch) continue;
    const cx = ox + (t.x + 0.5) * cell;
    const cy = oy + (t.y + 0.5) * cell;
    const isSelected = selectedActorId != null && (t.actorId || t.characterId) === selectedActorId;
    drawToken(ctx, cx, cy, cell * 0.48, ch, isSelected);
  }

  return {
    view: "top",
    cell,
    ox,
    oy,
    focus,
    zoom,
    panX,
    panY,
    visibleCells,
    screenToCell(sx, sy) {
      const x = Math.floor((sx - ox) / cell);
      const y = Math.floor((sy - oy) / cell);
      if (x < focus.x0 || y < focus.y0 || x >= focus.x1 || y >= focus.y1) return null;
      return { x, y };
    },
  };
}

/**
 * Поворот локальных координат фокуса (0 / 90 / 180 / 270° по часовой).
 * @param {number} lx
 * @param {number} ly
 * @param {number} rot
 * @param {number} fw
 * @param {number} fh
 */
function gridToView(lx, ly, rot, fw, fh) {
  switch (rot & 3) {
    case 1:
      return { x: ly, y: fw - lx };
    case 2:
      return { x: fw - lx, y: fh - ly };
    case 3:
      return { x: fh - ly, y: lx };
    default:
      return { x: lx, y: ly };
  }
}

/**
 * @param {number} vx
 * @param {number} vy
 * @param {number} rot
 * @param {number} fw
 * @param {number} fh
 */
function viewToGrid(vx, vy, rot, fw, fh) {
  switch (rot & 3) {
    case 1:
      return { x: fw - vy, y: vx };
    case 2:
      return { x: fw - vx, y: fh - vy };
    case 3:
      return { x: vy, y: fh - vx };
    default:
      return { x: vx, y: vy };
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} dungeon
 * @param {number} cssW
 * @param {number} cssH
 * @param {TokenPlacement[]} tokens
 * @param {Character[]} characters
 * @param {Object | null} selectedRoom
 * @param {Object | null} openedRoom
 * @param {number} isoRotation
 * @param {number} [zoom]
 * @param {number} [panX]
 * @param {number} [panY]
 * @param {Set<string> | null} [visibleCells]
 * @param {Set<number> | null} [visitedRoomIds]
 * @param {string | null} [selectedActorId]
 */
function drawIsometric(
  ctx,
  dungeon,
  cssW,
  cssH,
  tokens,
  characters,
  selectedRoom,
  openedRoom,
  isoRotation = 0,
  zoom = 1,
  panX = 0,
  panY = 0,
  visibleCells = null,
  visitedRoomIds = null,
  selectedActorId = null,
  obstacleVariants = null,
  doorStates = null
) {
  const { width: mapW, height: mapH, grid, theme } = dungeon;
  const focus = openedRoom
    ? roomFocusBounds(openedRoom, mapW, mapH, 1)
    : { x0: 0, y0: 0, x1: mapW, y1: mapH, w: mapW, h: mapH };

  const rot = isoRotation & 3;
  const viewW = rot % 2 === 0 ? focus.w : focus.h;
  const viewH = rot % 2 === 0 ? focus.h : focus.w;
  const span = viewW + viewH;

  const baseTileW = openedRoom
    ? Math.min(48, Math.max(22, (cssW * 0.85) / span * 1.5))
    : Math.min(28, Math.max(14, (cssW * 0.9) / span * 1.6));
  const tileW = baseTileW * zoom;
  const tileH = tileW * 0.5;
  const wallH = tileW * 0.55;

  const midX = viewW / 2;
  const midY = viewH / 2;
  const originX = cssW / 2;
  const originY = cssH * (openedRoom ? 0.18 : 0.12);

  const toView = (gx, gy) =>
    gridToView(gx - focus.x0, gy - focus.y0, rot, focus.w, focus.h);

  const toScreen = (vx, vy, z = 0) => ({
    sx: originX + (vx - midX - (vy - midY)) * (tileW / 2),
    sy: originY + (vx - midX + (vy - midY)) * (tileH / 2) - z,
  });

  const corners = [
    toScreen(0, 0),
    toScreen(viewW, 0),
    toScreen(0, viewH),
    toScreen(viewW, viewH),
  ];
  const minY = Math.min(...corners.map((c) => c.sy));
  const maxY = Math.max(...corners.map((c) => c.sy)) + wallH;
  const mapDrawnH = maxY - minY;
  const yShift = (cssH - mapDrawnH) / 2 - minY + 8;

  /** project from grid coordinates */
  const project = (gx, gy, z = 0) => {
    const v = toView(gx, gy);
    const p = toScreen(v.x, v.y, z);
    return { sx: p.sx + panX, sy: p.sy + yShift + panY };
  };

  /** @type {{x:number,y:number,depth:number}[]} */
  const drawOrder = [];
  for (let y = focus.y0; y < focus.y1; y++) {
    for (let x = focus.x0; x < focus.x1; x++) {
      if (grid[y][x] === "empty") continue;
      if (!cellRevealed(visibleCells, x, y)) continue;
      const v = toView(x, y);
      drawOrder.push({ x, y, depth: v.x + v.y });
    }
  }
  drawOrder.sort((a, b) => a.depth - b.depth || a.x - b.x || a.y - b.y);

  const highlightRoom = openedRoom || selectedRoom;
  const wallAroundHighlightRoom = (x, y) => {
    if (!highlightRoom) return false;
    const margin = 1;
    return (
      x >= highlightRoom.x - margin &&
      x < highlightRoom.x + highlightRoom.w + margin &&
      y >= highlightRoom.y - margin &&
      y < highlightRoom.y + highlightRoom.h + margin
    );
  };
  const shouldHideHighlightWall = (x, y) => {
    if (!highlightRoom || !wallAroundHighlightRoom(x, y)) return false;
    const wallCenter = project(x + 0.5, y + 0.5, wallH * 0.5);
    const roomCenter = project(highlightRoom.cx + 0.5, highlightRoom.cy + 0.5, tileH * 0.12);
    return wallCenter.sy > roomCenter.sy;
  };

  for (const cell of drawOrder) {
    const { x, y } = cell;
    const type = grid[y][x];

    if (type === "wall") {
      if (shouldHideHighlightWall(x, y)) continue;
      drawIsoWall(ctx, project, x, y, tileW, tileH, wallH, theme);
    } else {
      let color = cellColor(theme, type, x, y);
      drawIsoFloor(ctx, project, x, y, tileW, tileH, color, theme);
      if (type === "obstacle") {
        const c = project(x + 0.5, y + 0.5, tileH * 0.25);
        const variant = obstacleVariants?.[`${x},${y}`];
        drawObstacle(ctx, c.sx, c.sy, tileW * 0.48, theme, dungeon.setting, x, y, variant);
      }
    }
  }

  /** @type {{x:number,y:number,depth:number}[]} */
  const doorCells = [];
  for (let y = focus.y0; y < focus.y1; y++) {
    for (let x = focus.x0; x < focus.x1; x++) {
      if (!cellRevealed(visibleCells, x, y)) continue;
      if (grid[y][x] !== "door") continue;
      const v = toView(x, y);
      doorCells.push({ x, y, depth: v.x + v.y });
    }
  }
  doorCells.sort((a, b) => a.depth - b.depth || a.x - b.x || a.y - b.y);
  for (const cell of doorCells) {
    const orient = getDoorOrientation(grid, cell.x, cell.y);
    drawDoorIso(
      ctx,
      project,
      cell.x,
      cell.y,
      tileW,
      tileH,
      wallH,
      theme,
      isDoorOpen(doorStates, cell.x, cell.y),
      orient
    );
  }

  if (!openedRoom) {
    for (const room of dungeon.rooms) {
      if (visitedRoomIds && !visitedRoomIds.has(room.id)) continue;
      const c = project(room.cx + 0.5, room.cy + 0.5, tileH * 0.4);
      const isSel = selectedRoom && room.id === selectedRoom.id;
      ctx.font = `${isSel ? "700" : "600"} ${Math.max(11, tileW * 0.42)}px Sora, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.fillStyle = isSel ? "#ffe6c8" : "rgba(243,230,208,0.9)";
      const label = String(room.id + 1);
      ctx.strokeText(label, c.sx, c.sy);
      ctx.fillText(label, c.sx, c.sy);
    }
  }

  let visibleTokens = openedRoom
    ? tokens.filter(
        (t) =>
          t.x >= focus.x0 && t.x < focus.x1 && t.y >= focus.y0 && t.y < focus.y1
      )
    : tokens;
  if (visibleCells) {
    visibleTokens = visibleTokens.filter((t) => cellRevealed(visibleCells, t.x, t.y));
  }

  const sorted = [...visibleTokens].sort((a, b) => {
    const va = toView(a.x, a.y);
    const vb = toView(b.x, b.y);
    return va.x + va.y - (vb.x + vb.y);
  });
  for (const t of sorted) {
    const ch = characters.find((c) => c.id === (t.actorId || t.characterId));
    if (!ch) continue;
    const c = project(t.x + 0.5, t.y + 0.5, tileH * 0.35);
    const isSelected = selectedActorId != null && (t.actorId || t.characterId) === selectedActorId;
    drawToken(ctx, c.sx, c.sy, tileW * 0.48, ch, isSelected);
  }

  return {
    view: "iso",
    tileW,
    tileH,
    project,
    yShift,
    originX,
    originY,
    midX,
    midY,
    focus,
    isoRotation: rot,
    zoom,
    panX,
    panY,
    visibleCells,
    screenToCell(sx, sy) {
      const lx = sx - originX - panX;
      const ly = sy - yShift - originY - panY;
      const vx = midX + (lx / (tileW / 2) + ly / (tileH / 2)) / 2;
      const vy = midY + (ly / (tileH / 2) - lx / (tileW / 2)) / 2;
      const local = viewToGrid(vx, vy, rot, focus.w, focus.h);
      const x = Math.floor(local.x + focus.x0);
      const y = Math.floor(local.y + focus.y0);
      if (x < focus.x0 || y < focus.y0 || x >= focus.x1 || y >= focus.y1) return null;
      return { x, y };
    },
  };
}

function drawIsoFloor(ctx, project, x, y, tileW, tileH, color, theme) {
  const tl = project(x, y);
  const tr = project(x + 1, y);
  const br = project(x + 1, y + 1);
  const bl = project(x, y + 1);

  ctx.beginPath();
  ctx.moveTo(tl.sx, tl.sy);
  ctx.lineTo(tr.sx, tr.sy);
  ctx.lineTo(br.sx, br.sy);
  ctx.lineTo(bl.sx, bl.sy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function drawIsoWall(ctx, project, x, y, tileW, tileH, wallH, theme) {
  const top = [
    project(x, y, wallH),
    project(x + 1, y, wallH),
    project(x + 1, y + 1, wallH),
    project(x, y + 1, wallH),
  ];
  const base = [
    project(x, y, 0),
    project(x + 1, y, 0),
    project(x + 1, y + 1, 0),
    project(x, y + 1, 0),
  ];

  ctx.beginPath();
  ctx.moveTo(top[1].sx, top[1].sy);
  ctx.lineTo(top[2].sx, top[2].sy);
  ctx.lineTo(base[2].sx, base[2].sy);
  ctx.lineTo(base[1].sx, base[1].sy);
  ctx.closePath();
  ctx.fillStyle = shade(theme.wall, -18);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(top[3].sx, top[3].sy);
  ctx.lineTo(top[2].sx, top[2].sy);
  ctx.lineTo(base[2].sx, base[2].sy);
  ctx.lineTo(base[3].sx, base[3].sy);
  ctx.closePath();
  ctx.fillStyle = shade(theme.wall, -8);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(top[0].sx, top[0].sy);
  ctx.lineTo(top[1].sx, top[1].sy);
  ctx.lineTo(top[2].sx, top[2].sy);
  ctx.lineTo(top[3].sx, top[3].sy);
  ctx.closePath();
  ctx.fillStyle = theme.wallTop;
  ctx.fill();
}

/**
 * @param {{sx:number,sy:number}} a
 * @param {{sx:number,sy:number}} b
 * @param {number} t
 */
function lerpPt(a, b, t) {
  return { sx: a.sx + (b.sx - a.sx) * t, sy: a.sy + (b.sy - a.sy) * t };
}

/**
 * @param {{sx:number,sy:number}[]} quad — tl, tr, br, bl
 * @param {number} u
 * @param {number} v
 */
function quadUV(quad, u, v) {
  const top = lerpPt(quad[0], quad[1], u);
  const bot = lerpPt(quad[3], quad[2], u);
  return lerpPt(top, bot, v);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{sx:number,sy:number}[]} quad
 * @param {number} u0
 * @param {number} v0
 * @param {number} u1
 * @param {number} v1
 * @param {string} fill
 * @param {string} [stroke]
 */
function fillQuadUV(ctx, quad, u0, v0, u1, v1, fill, stroke) {
  const p00 = quadUV(quad, u0, v0);
  const p10 = quadUV(quad, u1, v0);
  const p11 = quadUV(quad, u1, v1);
  const p01 = quadUV(quad, u0, v1);
  ctx.beginPath();
  ctx.moveTo(p00.sx, p00.sy);
  ctx.lineTo(p10.sx, p10.sy);
  ctx.lineTo(p11.sx, p11.sy);
  ctx.lineTo(p01.sx, p01.sy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(0.6, 1);
    ctx.stroke();
  }
}

/**
 * Минималистичная двухпанельная створка (как на референсе).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string} wood
 * @param {string} woodDark
 * @param {string} woodLight
 * @param {string} frame
 * @param {string} metal
 * @param {boolean} [handleRight]
 */
function drawDoorLeafMinimal(ctx, x, y, w, h, wood, woodDark, woodLight, frame, metal, handleRight = false) {
  const pad = Math.max(1.5, w * 0.07);
  const inset = Math.max(1, w * 0.05);

  ctx.fillStyle = frame;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = wood;
  ctx.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);

  const innerX = x + pad + inset;
  const innerW = w - pad * 2 - inset * 2;
  const innerY = y + pad + inset;
  const innerH = h - pad * 2 - inset * 2;
  const gap = Math.max(1.5, innerH * 0.04);
  const topH = innerH * 0.62;
  const botH = innerH * 0.2;
  const botY = innerY + topH + gap;

  ctx.fillStyle = shade(wood, -38);
  ctx.fillRect(innerX, innerY, innerW, topH);
  ctx.fillRect(innerX, botY, innerW, botH);

  ctx.fillStyle = shade(wood, -12);
  ctx.fillRect(innerX + inset * 0.5, innerY + inset * 0.5, innerW - inset, topH - inset);
  ctx.fillRect(innerX + inset * 0.5, botY + inset * 0.5, innerW - inset, botH - inset * 0.5);

  ctx.strokeStyle = shade(woodDark, -12);
  ctx.lineWidth = Math.max(0.5, w * 0.025);
  ctx.strokeRect(innerX + 0.5, innerY + 0.5, innerW - 1, topH - 1);
  ctx.strokeRect(innerX + 0.5, botY + 0.5, innerW - 1, botH - 1);

  const hx = handleRight ? x + w - pad - w * 0.11 : x + pad + w * 0.06;
  const hy = innerY + topH * 0.72;
  const hw = Math.max(2, w * 0.07);
  const hh = Math.max(2, h * 0.055);
  ctx.fillStyle = metal;
  ctx.fillRect(hx, hy, hw, hh);
  ctx.beginPath();
  ctx.arc(hx + hw * 0.5, hy + hh * 0.5, hw * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Двухпанельная створка на грани 3D-объёма (изометрия).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{sx:number,sy:number}[]} quad
 * @param {string} wood
 * @param {string} woodDark
 * @param {string} woodLight
 * @param {string} frame
 * @param {string} metal
 * @param {boolean} [handleRight]
 */
function drawDoorLeafMinimalQuad(ctx, quad, wood, woodDark, woodLight, frame, metal, handleRight = false) {
  fillQuadUV(ctx, quad, 0, 0, 1, 1, frame);
  fillQuadUV(ctx, quad, 0.07, 0.06, 0.93, 0.94, wood);
  fillQuadUV(ctx, quad, 0.12, 0.1, 0.88, 0.68, shade(wood, -38), shade(woodDark, -10));
  fillQuadUV(ctx, quad, 0.14, 0.12, 0.86, 0.64, shade(wood, -12));
  fillQuadUV(ctx, quad, 0.12, 0.1, 0.88, 0.16, woodLight);
  fillQuadUV(ctx, quad, 0.12, 0.74, 0.88, 0.92, shade(wood, -38), shade(woodDark, -10));
  fillQuadUV(ctx, quad, 0.14, 0.76, 0.86, 0.9, shade(wood, -12));
  fillQuadUV(ctx, quad, 0.12, 0.74, 0.88, 0.8, woodLight);
  const hu0 = handleRight ? 0.78 : 0.1;
  fillQuadUV(ctx, quad, hu0, 0.58, hu0 + 0.08, 0.66, metal);
}

/**
 * Вертикальная грань двери на стороне, обращённой к комнате.
 * @param {(gx:number,gy:number,z?:number)=>{sx:number,sy:number}} project
 * @param {number} x
 * @param {number} y
 * @param {import('./generator.js').DoorOrientation} orient
 * @param {number} doorH
 * @param {number} z0
 * @returns {{sx:number,sy:number}[]}
 */
function doorVerticalFace(project, x, y, orient, doorH, z0) {
  switch (orient.roomSide) {
    case "n":
      return [project(x, y, doorH), project(x + 1, y, doorH), project(x + 1, y, z0), project(x, y, z0)];
    case "s":
      return [
        project(x + 1, y + 1, doorH),
        project(x, y + 1, doorH),
        project(x, y + 1, z0),
        project(x + 1, y + 1, z0),
      ];
    case "w":
      return [project(x, y + 1, doorH), project(x, y, doorH), project(x, y, z0), project(x, y + 1, z0)];
    default:
      return [
        project(x + 1, y, doorH),
        project(x + 1, y + 1, doorH),
        project(x + 1, y + 1, z0),
        project(x + 1, y, z0),
      ];
  }
}

/**
 * @param {{sx:number,sy:number}[]} face
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} fill
 */
function fillFace(ctx, face, fill) {
  ctx.beginPath();
  ctx.moveTo(face[0].sx, face[0].sy);
  for (let i = 1; i < face.length; i++) ctx.lineTo(face[i].sx, face[i].sy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * Текстура «закрыто1» / «открыто1» — вид сверху.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px
 * @param {number} py
 * @param {number} cell
 * @param {Object} theme
 * @param {boolean} open
 * @param {import('./generator.js').DoorOrientation} orient
 */
function drawDoorTopDown(ctx, px, py, cell, theme, open, orient) {
  const wood = theme.door;
  const woodDark = shade(wood, -30);
  const woodLight = shade(wood, 18);
  const frame = shade(theme.wall, -5);
  const metal = "#a89878";

  ctx.save();
  const pad = Math.max(1, cell * 0.04);
  const alongWall = orient.axis === "h";
  const bw = alongWall ? cell - pad * 2 : cell * 0.78;
  const bh = alongWall ? cell * 0.78 : cell - pad * 2;
  const bx = px + (cell - bw) / 2;
  const by = py + (cell - bh) / 2;
  const handleRight = orient.roomSide === "w" || orient.roomSide === "n";

  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = Math.max(2, cell * 0.08);

  if (!open) {
    drawDoorLeafMinimal(ctx, bx, by, bw, bh, wood, woodDark, woodLight, frame, metal, handleRight);
  } else {
    const thick = Math.max(3, cell * 0.2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = frame;
    if (alongWall) {
      ctx.fillRect(px + pad, py + pad, cell - pad * 2, thick);
      ctx.fillRect(px + pad, py + cell - pad - thick, cell - pad * 2, thick);
      const leafY = orient.roomSide === "n" ? py + pad + thick * 0.15 : py + cell - pad - thick * 1.1;
      drawDoorLeafMinimal(ctx, px + pad, leafY, cell - pad * 2, thick * 0.95, wood, woodDark, woodLight, frame, metal, false);
    } else {
      ctx.fillRect(px + pad, py + pad, thick, cell - pad * 2);
      ctx.fillRect(px + cell - pad - thick, py + pad, thick, cell - pad * 2);
      const leafX = orient.roomSide === "w" ? px + pad + thick * 0.15 : px + cell - pad - thick * 1.1;
      drawDoorLeafMinimal(ctx, leafX, py + pad, thick * 0.95, cell - pad * 2, wood, woodDark, woodLight, frame, metal, false);
    }
  }
  ctx.restore();
}

/**
 * Текстура «закрыто1» / «открыто1» — изометрия (3D двухпанельная дверь).
 * @param {CanvasRenderingContext2D} ctx
 * @param {(gx:number,gy:number,z?:number)=>{sx:number,sy:number}} project
 * @param {number} x
 * @param {number} y
 * @param {number} tileW
 * @param {number} tileH
 * @param {number} wallH
 * @param {Object} theme
 * @param {boolean} open
 * @param {import('./generator.js').DoorOrientation} orient
 */
function drawDoorIso(ctx, project, x, y, tileW, tileH, wallH, theme, open, orient) {
  const wood = theme.door;
  const woodDark = shade(wood, -32);
  const woodLight = shade(wood, 16);
  const frame = shade(theme.wall, -8);
  const metal = "#a89878";
  const doorH = wallH * 1.02;
  const z0 = tileH * 0.04;
  const handleRight = orient.roomSide === "e" || orient.roomSide === "n";

  ctx.save();
  if (!open) {
    const face = doorVerticalFace(project, x, y, orient, doorH, z0);
    fillFace(ctx, face, woodDark);
    drawDoorLeafMinimalQuad(ctx, face, wood, woodDark, woodLight, frame, metal, handleRight);
  } else {
    const hinge = orient.roomSide === "n" ? project(x, y, z0) : orient.roomSide === "s" ? project(x + 1, y + 1, z0) : orient.roomSide === "w" ? project(x, y + 1, z0) : project(x + 1, y, z0);
    const mid = project(x + 0.5, y + 0.5, z0);
    const openTip = {
      sx: mid.sx + (mid.sx - hinge.sx) * 0.85 + (orient.roomSide === "n" ? tileW * 0.15 : orient.roomSide === "s" ? -tileW * 0.15 : 0),
      sy: mid.sy + (mid.sy - hinge.sy) * 0.85 + (orient.roomSide === "w" ? tileH * 0.15 : orient.roomSide === "e" ? -tileH * 0.15 : 0),
    };
    const face = doorVerticalFace(project, x, y, orient, doorH, z0);
    const leaf = [
      hinge,
      { sx: hinge.sx + (face[1].sx - face[0].sx) * 0.45, sy: hinge.sy + (face[1].sy - face[0].sy) * 0.45 },
      { sx: openTip.sx, sy: openTip.sy - doorH * 0.92 },
      { sx: hinge.sx, sy: hinge.sy - doorH * 0.92 },
    ];
    fillFace(ctx, leaf, wood);
    drawDoorLeafMinimalQuad(ctx, leaf, wood, woodDark, woodLight, frame, metal, handleRight);
  }
  ctx.restore();
}

function cellColor(theme, type, x, y) {
  const alt = (x + y) % 2 === 0;
  switch (type) {
    case "floor":
      return alt ? theme.floor : theme.floorAlt;
    case "corridor":
      return theme.corridor;
    case "wall":
      return theme.wall;
    case "door":
      return theme.corridor;
    case "feature":
      return alt ? theme.floor : theme.floorAlt;
    case "obstacle":
      return alt ? theme.floor : theme.floorAlt;
    default:
      return theme.bg;
  }
}

function drawObstacle(ctx, cx, cy, r, theme, setting, gx = 0, gy = 0, variantOverride = null) {
  const variant =
    variantOverride != null && variantOverride >= 0
      ? variantOverride % 3
      : (Math.abs(gx * 7 + gy * 13) % 3) | 0;
  ctx.save();

  if (setting === "forest") {
    drawForestObstacle(ctx, cx, cy, r, theme, variant);
  } else if (setting === "city") {
    drawCityObstacle(ctx, cx, cy, r, theme, variant);
  } else {
    drawDungeonObstacle(ctx, cx, cy, r, theme, variant, gx, gy);
  }

  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {Object} theme
 * @param {number} variant
 */
function drawForestObstacle(ctx, cx, cy, r, theme, variant) {
  const trunk = theme.obstacle;
  const bark = shade(trunk, -18);
  const foliage = theme.feature || "#4a7a38";
  const foliageDark = shade(foliage, -22);
  const foliageLight = shade(foliage, 16);

  if (variant === 0) {
    // Лиственное дерево — круглая крона
    ctx.fillStyle = foliageDark;
    ctx.beginPath();
    ctx.arc(cx - r * 0.22, cy - r * 0.35, r * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = foliage;
    ctx.beginPath();
    ctx.arc(cx + r * 0.18, cy - r * 0.42, r * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = foliageLight;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.55, r * 0.44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bark;
    ctx.fillRect(cx - r * 0.14, cy - r * 0.08, r * 0.28, r * 0.72);
    ctx.fillStyle = shade(bark, 12);
    ctx.fillRect(cx - r * 0.1, cy + r * 0.35, r * 0.2, r * 0.18);
  } else if (variant === 1) {
    // Ель — три яруса
    const tiers = [
      { y: -0.72, w: 0.38 },
      { y: -0.48, w: 0.52 },
      { y: -0.22, w: 0.66 },
    ];
    ctx.fillStyle = bark;
    ctx.fillRect(cx - r * 0.1, cy - r * 0.05, r * 0.2, r * 0.78);
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      ctx.fillStyle = i === 0 ? foliageLight : i === 1 ? foliage : foliageDark;
      ctx.beginPath();
      ctx.moveTo(cx, cy + r * t.y);
      ctx.lineTo(cx - r * t.w, cy + r * (t.y + 0.34));
      ctx.lineTo(cx + r * t.w, cy + r * (t.y + 0.34));
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Куст / молодое дерево
    ctx.fillStyle = bark;
    ctx.fillRect(cx - r * 0.08, cy + r * 0.05, r * 0.16, r * 0.55);
    ctx.fillStyle = foliageDark;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.2, cy - r * 0.12, r * 0.34, r * 0.28, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = foliage;
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.15, cy - r * 0.18, r * 0.36, r * 0.3, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = foliageLight;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.28, r * 0.32, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {Object} theme
 * @param {number} variant
 */
function drawCityObstacle(ctx, cx, cy, r, theme, variant) {
  const wood = theme.obstacle;
  const woodDark = shade(wood, -28);
  const woodLight = shade(wood, 18);
  const iron = "#4a4038";
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.strokeStyle = woodDark;

  if (variant === 0) {
    // Ящик с досками
    ctx.fillStyle = wood;
    ctx.fillRect(cx - r * 0.72, cy - r * 0.5, r * 1.44, r * 1.05);
    ctx.strokeRect(cx - r * 0.72, cy - r * 0.5, r * 1.44, r * 1.05);
    ctx.fillStyle = woodLight;
    ctx.fillRect(cx - r * 0.68, cy - r * 0.46, r * 0.28, r * 0.97);
    ctx.fillRect(cx + r * 0.08, cy - r * 0.46, r * 0.28, r * 0.97);
    ctx.strokeStyle = woodDark;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.72, cy + r * 0.02);
    ctx.lineTo(cx + r * 0.72, cy + r * 0.02);
    ctx.moveTo(cx, cy - r * 0.5);
    ctx.lineTo(cx, cy + r * 0.55);
    ctx.stroke();
    ctx.fillStyle = iron;
    ctx.fillRect(cx - r * 0.08, cy - r * 0.08, r * 0.16, r * 0.16);
  } else if (variant === 1) {
    // Бочка
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.42, r * 0.55, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(cx - r * 0.55, cy - r * 0.42, r * 1.1, r * 0.82);
    ctx.strokeRect(cx - r * 0.55, cy - r * 0.42, r * 1.1, r * 0.82);
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.4, r * 0.55, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = woodDark;
    for (const band of [-0.28, 0.08, 0.38]) {
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * band, r * 0.56, r * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = woodLight;
    ctx.fillRect(cx - r * 0.12, cy - r * 0.35, r * 0.24, r * 0.7);
  } else {
    // Каменный блок / телега
    ctx.fillStyle = "#7a7064";
    ctx.fillRect(cx - r * 0.75, cy - r * 0.35, r * 1.5, r * 0.75);
    ctx.strokeStyle = shade("#7a7064", -25);
    ctx.strokeRect(cx - r * 0.75, cy - r * 0.35, r * 1.5, r * 0.75);
    ctx.fillStyle = shade("#7a7064", 14);
    ctx.fillRect(cx - r * 0.68, cy - r * 0.28, r * 0.35, r * 0.6);
    ctx.fillStyle = woodDark;
    ctx.beginPath();
    ctx.arc(cx - r * 0.55, cy + r * 0.48, r * 0.18, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.55, cy + r * 0.48, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = iron;
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.beginPath();
    ctx.arc(cx - r * 0.55, cy + r * 0.48, r * 0.08, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.55, cy + r * 0.48, r * 0.08, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number[][]} pts
 * @param {string} fill
 * @param {string} [edge]
 */
function drawRockShape(ctx, cx, cy, r, pts, fill, edge) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx + r * pts[0][0], cy + r * pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(cx + r * pts[i][0], cy + r * pts[i][1]);
  }
  ctx.closePath();
  ctx.fill();
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(0.8, r * 0.04);
    ctx.stroke();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {string} stone
 * @param {string} stoneDark
 * @param {string} stoneLight
 * @param {number} rockStyle
 */
function drawRockPile(ctx, cx, cy, r, stone, stoneDark, stoneLight, rockStyle) {
  if (rockStyle === 0) {
    // Обломки — острые угловатые камни
    const shards = [
      { pts: [[-0.38, 0.18], [-0.12, 0.32], [0.02, 0.08], [-0.18, -0.08]], fill: stoneDark },
      { pts: [[0.08, -0.12], [0.36, 0.02], [0.28, 0.28], [0.02, 0.22]], fill: stone },
      { pts: [[-0.08, -0.28], [0.18, -0.22], [0.12, 0.02], [-0.14, 0.06]], fill: stoneLight },
      { pts: [[0.22, 0.22], [0.44, 0.34], [0.38, 0.48], [0.14, 0.38]], fill: stoneDark },
      { pts: [[-0.32, 0.32], [-0.08, 0.42], [0.02, 0.52], [-0.28, 0.48]], fill: stone },
      { pts: [[-0.42, -0.02], [-0.28, 0.12], [-0.34, 0.28], [-0.48, 0.08]], fill: shade(stone, -12) },
    ];
    for (const s of shards) {
      drawRockShape(ctx, cx, cy, r, s.pts, s.fill, stoneDark);
    }
    ctx.strokeStyle = shade(stoneDark, -15);
    ctx.lineWidth = Math.max(0.6, r * 0.03);
    ctx.beginPath();
    ctx.moveTo(cx + r * -0.2, cy + r * 0.05);
    ctx.lineTo(cx + r * 0.08, cy + r * 0.18);
    ctx.stroke();
  } else if (rockStyle === 1) {
    // Валуны — крупные округло-угловатые глыбы
    const boulders = [
      { dx: -0.2, dy: 0.08, pts: [[-0.28, 0.08], [-0.08, -0.22], [0.22, -0.12], [0.26, 0.18], [0.02, 0.28], [-0.24, 0.22]], fill: stoneDark },
      { dx: 0.22, dy: 0.18, pts: [[-0.2, 0.12], [0.08, -0.18], [0.24, 0.02], [0.12, 0.24], [-0.12, 0.2]], fill: stone },
      { dx: -0.05, dy: -0.12, pts: [[-0.22, 0.1], [0.04, -0.2], [0.26, 0.04], [0.1, 0.22], [-0.18, 0.16]], fill: stoneLight },
    ];
    for (const b of boulders) {
      const pts = b.pts.map(([x, y]) => [x + b.dx, y + b.dy]);
      drawRockShape(ctx, cx, cy, r, pts, b.fill, stoneDark);
      // Трещина
      ctx.strokeStyle = shade(stoneDark, -20);
      ctx.lineWidth = Math.max(0.8, r * 0.035);
      ctx.beginPath();
      ctx.moveTo(cx + r * (pts[1][0] + 0.02), cy + r * (pts[1][1] + 0.02));
      ctx.lineTo(cx + r * (pts[3][0] - 0.02), cy + r * (pts[3][1] - 0.02));
      ctx.stroke();
    }
  } else {
    // Плиты — плоские каменные блоки и щебень
    const slabs = [
      { x: -0.28, y: 0.28, w: 0.38, h: 0.1, rot: -0.22, fill: stoneDark },
      { x: 0.02, y: 0.18, w: 0.42, h: 0.11, rot: 0.12, fill: stone },
      { x: -0.08, y: 0.02, w: 0.36, h: 0.09, rot: -0.08, fill: stoneLight },
      { x: 0.18, y: 0.32, w: 0.3, h: 0.08, rot: 0.35, fill: shade(stone, -8) },
    ];
    for (const s of slabs) {
      ctx.save();
      ctx.translate(cx + r * s.x, cy + r * s.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = s.fill;
      ctx.fillRect(-r * s.w * 0.5, -r * s.h * 0.5, r * s.w, r * s.h);
      ctx.strokeStyle = stoneDark;
      ctx.lineWidth = Math.max(0.7, r * 0.03);
      ctx.strokeRect(-r * s.w * 0.5, -r * s.h * 0.5, r * s.w, r * s.h);
      ctx.restore();
    }
    const chips = [
      [[0.32, -0.08], [0.42, 0.02], [0.36, 0.12], [0.24, 0.06]],
      [[-0.4, 0.08], [-0.32, 0.16], [-0.36, 0.26], [-0.44, 0.18]],
      [[0.08, -0.22], [0.18, -0.16], [0.14, -0.06], [0.02, -0.1]],
    ];
    for (const pts of chips) {
      drawRockShape(ctx, cx, cy, r, pts, shade(stoneDark, 8), null);
    }
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {Object} theme
 * @param {number} variant
 * @param {number} [gx]
 * @param {number} [gy]
 */
function drawDungeonObstacle(ctx, cx, cy, r, theme, variant, gx = 0, gy = 0) {
  const stone = theme.obstacle;
  const stoneDark = shade(stone, -30);
  const stoneLight = shade(stone, 22);

  if (variant === 0) {
    const rockStyle = (Math.abs(gx * 3 + gy * 5) % 3) | 0;
    drawRockPile(ctx, cx, cy, r, stone, stoneDark, stoneLight, rockStyle);
  } else if (variant === 1) {
    // Колонна — минималистичная тоска / коринфский ордер
    const w = r * 0.44;
    const shaftTop = cy - r * 0.42;
    const shaftBottom = cy + r * 0.12;
    const shaftH = shaftBottom - shaftTop;

    // Плинф — квадратное основание
    ctx.fillStyle = stoneDark;
    ctx.fillRect(cx - r * 0.4, cy + r * 0.24, r * 0.8, r * 0.14);
    ctx.fillStyle = stone;
    ctx.fillRect(cx - r * 0.36, cy + r * 0.2, r * 0.72, r * 0.08);

    // Круглые профили базы
    ctx.fillStyle = stoneLight;
    ctx.fillRect(cx - r * 0.34, cy + r * 0.14, r * 0.68, r * 0.05);
    ctx.fillStyle = stone;
    ctx.fillRect(cx - r * 0.3, cy + r * 0.1, r * 0.6, r * 0.04);

    // Ствол с каннелюрами
    ctx.fillStyle = stone;
    ctx.fillRect(cx - w / 2, shaftTop, w, shaftH);
    ctx.fillStyle = stoneLight;
    ctx.fillRect(cx - w / 2 + r * 0.03, shaftTop + r * 0.02, r * 0.07, shaftH - r * 0.04);
    ctx.strokeStyle = stoneDark;
    ctx.lineWidth = Math.max(1, r * 0.035);
    for (let i = -2; i <= 2; i++) {
      const fx = cx + i * r * 0.085;
      ctx.beginPath();
      ctx.moveTo(fx, shaftTop + r * 0.03);
      ctx.lineTo(fx, shaftBottom - r * 0.03);
      ctx.stroke();
    }

    // Абака — верхняя плита
    ctx.fillStyle = stone;
    ctx.fillRect(cx - r * 0.38, cy - r * 0.72, r * 0.76, r * 0.09);
    ctx.fillStyle = stoneLight;
    ctx.fillRect(cx - r * 0.36, cy - r * 0.71, r * 0.72, r * 0.03);

    // Капитель — раскрывающийся барабан
    ctx.fillStyle = stoneLight;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, shaftTop);
    ctx.lineTo(cx + w / 2, shaftTop);
    ctx.lineTo(cx + r * 0.34, cy - r * 0.58);
    ctx.lineTo(cx - r * 0.34, cy - r * 0.58);
    ctx.closePath();
    ctx.fill();

    // Вolutы — упрощённые завитки
    ctx.strokeStyle = stoneDark;
    ctx.lineWidth = Math.max(1.2, r * 0.05);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx - r * 0.22, cy - r * 0.6, r * 0.09, Math.PI * 0.15, Math.PI * 1.45);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + r * 0.22, cy - r * 0.6, r * 0.09, Math.PI * 1.55, Math.PI * 0.45);
    ctx.stroke();

    // Листья капители — два простых лепестка
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.08, cy - r * 0.52);
    ctx.quadraticCurveTo(cx, cy - r * 0.46, cx + r * 0.08, cy - r * 0.52);
    ctx.quadraticCurveTo(cx, cy - r * 0.56, cx - r * 0.08, cy - r * 0.52);
    ctx.fill();
  } else {
    // Сталагмит / кристалл
    ctx.fillStyle = stoneDark;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.75);
    ctx.lineTo(cx + r * 0.28, cy + r * 0.45);
    ctx.lineTo(cx - r * 0.28, cy + r * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.05, cy - r * 0.55);
    ctx.lineTo(cx + r * 0.18, cy + r * 0.4);
    ctx.lineTo(cx - r * 0.22, cy + r * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = stoneLight;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.02, cy - r * 0.62);
    ctx.lineTo(cx + r * 0.12, cy - r * 0.15);
    ctx.lineTo(cx - r * 0.04, cy - r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(theme.feature || stone, 10);
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.35, cy - r * 0.15);
    ctx.lineTo(cx + r * 0.48, cy + r * 0.35);
    ctx.lineTo(cx + r * 0.28, cy + r * 0.38);
    ctx.closePath();
    ctx.fill();
  }
}

function drawFeature(ctx, cx, cy, r, theme, setting) {
  ctx.save();
  ctx.fillStyle = theme.feature;
  if (setting === "forest") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.85, cy + r * 0.6);
    ctx.lineTo(cx - r * 0.85, cy + r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(theme.feature, -30);
    ctx.fillRect(cx - r * 0.15, cy + r * 0.35, r * 0.3, r * 0.45);
  } else if (setting === "city") {
    ctx.fillRect(cx - r * 0.7, cy - r * 0.2, r * 1.4, r * 0.9);
    ctx.fillStyle = shade(theme.feature, 20);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.85, cy - r * 0.15);
    ctx.lineTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.85, cy - r * 0.15);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(theme.feature, -25);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {Character} ch
 * @param {boolean} [selected]
 */
function drawToken(ctx, cx, cy, r, ch, selected = false) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.55, r * 0.7, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  if (selected) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.38, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 214, 120, 0.95)";
    ctx.lineWidth = Math.max(2.5, r * 0.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.22, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 245, 200, 0.55)";
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.stroke();
  }

  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  grad.addColorStop(0, shade(ch.color, 35));
  grad.addColorStop(1, ch.color);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = selected ? 2.5 : 2;
  ctx.strokeStyle = selected
    ? "rgba(255, 230, 150, 0.95)"
    : ch.kind === "enemy"
      ? "rgba(255,120,100,0.85)"
      : "rgba(255,255,255,0.55)";
  ctx.stroke();

  if (ch.kind === "enemy") {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(180,35,24,0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.fillStyle = "#fff";
  ctx.font = `${Math.max(10, r * 0.95)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ch.symbol, cx, cy + 1);

  ctx.font = `600 ${Math.max(9, r * 0.45)}px Sora, sans-serif`;
  ctx.fillStyle = selected ? "#ffe6a0" : "rgba(255,245,230,0.95)";
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 3;
  ctx.strokeText(ch.name, cx, cy - r - 6);
  ctx.fillText(ch.name, cx, cy - r - 6);
  ctx.restore();
}

function shade(hex, amount) {
  const n = hex.replace("#", "");
  const num = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0xff) + amount;
  let b = (num & 0xff) + amount;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function tint(hex, tintHex, amount) {
  const parse = (h) => {
    const n = h.replace("#", "");
    const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
    const num = parseInt(full, 16);
    return { r: num >> 16, g: (num >> 8) & 0xff, b: num & 0xff };
  };
  const a = parse(hex);
  const t = parse(tintHex);
  const r = Math.round(a.r * (1 - amount) + t.r * amount);
  const g = Math.round(a.g * (1 - amount) + t.g * amount);
  const b = Math.round(a.b * (1 - amount) + t.b * amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import('./generator.js').SettingId} setting
 * @param {number} variant
 */
export function renderObstaclePreview(canvas, setting, variant) {
  const theme = THEMES[setting] || THEMES.forest;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = 56;
  canvas.width = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme.floor;
  ctx.fillRect(0, 0, size, size);
  drawObstacle(ctx, size / 2, size / 2 + 2, size * 0.36, theme, setting, 0, 0, variant);
}
