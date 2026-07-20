import { isWalkable, roomFocusBounds } from "./generator.js";

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
      selectedActorId
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
    selectedActorId
  );
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
  selectedActorId = null
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
      if (type === "door") {
        ctx.fillStyle = theme.door;
        ctx.fillRect(px + cell * 0.15, py + cell * 0.35, cell * 0.7, cell * 0.3);
      }
      if (type === "feature") {
        drawFeature(ctx, px + cell / 2, py + cell / 2, cell * 0.32, theme, dungeon.setting);
      }
      if (type === "obstacle") {
        drawObstacle(ctx, px + cell / 2, py + cell / 2, cell * 0.36, theme, dungeon.setting);
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

  if (selectedRoom && !openedRoom && (!visitedRoomIds || visitedRoomIds.has(selectedRoom.id))) {
    drawRoomHighlightTop(ctx, selectedRoom, ox, oy, cell);
  }
  if (openedRoom) {
    drawRoomHighlightTop(ctx, openedRoom, ox, oy, cell, true);
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
    drawToken(ctx, cx, cy, cell * (openedRoom ? 0.38 : 0.42), ch, isSelected);
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
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} room
 * @param {number} ox
 * @param {number} oy
 * @param {number} cell
 * @param {boolean} [strong]
 */
function drawRoomHighlightTop(ctx, room, ox, oy, cell, strong = false) {
  const px = ox + room.x * cell;
  const py = oy + room.y * cell;
  ctx.save();
  ctx.strokeStyle = strong ? "rgba(255, 200, 120, 0.95)" : "rgba(184, 74, 31, 0.95)";
  ctx.lineWidth = strong ? 3 : 2.5;
  ctx.setLineDash(strong ? [] : [6, 4]);
  ctx.strokeRect(px + 1, py + 1, room.w * cell - 2, room.h * cell - 2);
  ctx.fillStyle = strong ? "rgba(255, 200, 120, 0.08)" : "rgba(184, 74, 31, 0.18)";
  ctx.fillRect(px, py, room.w * cell, room.h * cell);
  ctx.restore();
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
  selectedActorId = null
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
  const originX = cssW / 2 + panX;
  const originY = cssH * (openedRoom ? 0.18 : 0.12) + panY;

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
    return { sx: p.sx, sy: p.sy + yShift };
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

  for (const cell of drawOrder) {
    const { x, y } = cell;
    const type = grid[y][x];

    const inSelected =
      selectedRoom &&
      x >= selectedRoom.x &&
      x < selectedRoom.x + selectedRoom.w &&
      y >= selectedRoom.y &&
      y < selectedRoom.y + selectedRoom.h;

    if (type === "wall") {
      drawIsoWall(ctx, project, x, y, tileW, tileH, wallH, theme);
    } else {
      let color = cellColor(theme, type, x, y);
      if (inSelected && !openedRoom) {
        color = tint(color, "#b84a1f", 0.22);
      }
      drawIsoFloor(ctx, project, x, y, tileW, tileH, color, theme);
      if (type === "door") {
        const c = project(x + 0.5, y + 0.5, tileH * 0.15);
        ctx.fillStyle = theme.door;
        ctx.beginPath();
        ctx.ellipse(c.sx, c.sy, tileW * 0.18, tileH * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (type === "feature") {
        const c = project(x + 0.5, y + 0.5, tileH * 0.2);
        drawFeature(ctx, c.sx, c.sy, tileW * 0.2, theme, dungeon.setting);
      }
      if (type === "obstacle") {
        const c = project(x + 0.5, y + 0.5, tileH * 0.25);
        drawObstacle(ctx, c.sx, c.sy, tileW * 0.22, theme, dungeon.setting);
      }
    }
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

  if (openedRoom || (selectedRoom && (!visitedRoomIds || visitedRoomIds.has(selectedRoom.id)))) {
    const room = openedRoom || selectedRoom;
    drawIsoRoomOutline(ctx, project, room, tileW, tileH, !!openedRoom);
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
    drawToken(ctx, c.sx, c.sy, tileW * (openedRoom ? 0.32 : 0.28), ch, isSelected);
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
      const lx = sx - originX;
      const ly = sy - yShift - originY;
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

function drawIsoRoomOutline(ctx, project, room, tileW, tileH, strong) {
  const points = [
    project(room.x, room.y),
    project(room.x + room.w, room.y),
    project(room.x + room.w, room.y + room.h),
    project(room.x, room.y + room.h),
  ];
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].sx, points[0].sy);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].sx, points[i].sy);
  ctx.closePath();
  ctx.strokeStyle = strong ? "rgba(255, 200, 120, 0.95)" : "rgba(184, 74, 31, 0.95)";
  ctx.lineWidth = strong ? 2.5 : 2;
  ctx.setLineDash(strong ? [] : [5, 4]);
  ctx.stroke();
  ctx.restore();
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

function drawObstacle(ctx, cx, cy, r, theme, setting) {
  ctx.save();
  ctx.fillStyle = theme.obstacle;
  ctx.strokeStyle = shade(theme.obstacle, -25);
  ctx.lineWidth = Math.max(1, r * 0.12);

  if (setting === "forest") {
    // fallen log / root
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.1, r * 0.95, r * 0.4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = shade(theme.obstacle, 20);
    ctx.beginPath();
    ctx.arc(cx - r * 0.55, cy, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else if (setting === "city") {
    // crate
    ctx.fillRect(cx - r * 0.7, cy - r * 0.55, r * 1.4, r * 1.15);
    ctx.strokeRect(cx - r * 0.7, cy - r * 0.55, r * 1.4, r * 1.15);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.7, cy);
    ctx.lineTo(cx + r * 0.7, cy);
    ctx.moveTo(cx, cy - r * 0.55);
    ctx.lineTo(cx, cy + r * 0.6);
    ctx.stroke();
  } else {
    // rubble / stone pile
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.9, cy + r * 0.55);
    ctx.lineTo(cx - r * 0.35, cy - r * 0.5);
    ctx.lineTo(cx + r * 0.2, cy + r * 0.1);
    ctx.lineTo(cx + r * 0.85, cy - r * 0.35);
    ctx.lineTo(cx + r * 0.95, cy + r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = shade(theme.obstacle, 18);
    ctx.beginPath();
    ctx.arc(cx - r * 0.15, cy + r * 0.15, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
