import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, loadFullState, saveFullState, kvGet, kvSet, getDbPath } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 8765;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

getDb();

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<any>}
 */
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {unknown} data
 */
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/**
 * @param {string} urlPath
 */
function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const rel = decoded === "/" ? "/index.html" : decoded;
  const full = path.normalize(path.join(ROOT, rel));
  if (!full.startsWith(ROOT)) return null;
  return full;
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function handleApi(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;
  const method = req.method || "GET";

  if (pathname === "/api/health" && method === "GET") {
    sendJson(res, 200, { ok: true, db: getDbPath() });
    return;
  }

  if (pathname === "/api/state" && method === "GET") {
    sendJson(res, 200, loadFullState());
    return;
  }

  if (pathname === "/api/state" && method === "PUT") {
    const body = await readJson(req);
    saveFullState(body);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/accounts" && method === "GET") {
    sendJson(res, 200, { accounts: kvGet("accounts") });
    return;
  }
  if (pathname === "/api/accounts" && method === "PUT") {
    const body = await readJson(req);
    kvSet("accounts", body.accounts ?? body);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/characters" && method === "GET") {
    sendJson(res, 200, { characters: kvGet("characters") });
    return;
  }
  if (pathname === "/api/characters" && method === "PUT") {
    const body = await readJson(req);
    kvSet("characters", body.characters ?? body);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/enemies" && method === "GET") {
    sendJson(res, 200, { enemies: kvGet("enemies") });
    return;
  }
  if (pathname === "/api/enemies" && method === "PUT") {
    const body = await readJson(req);
    kvSet("enemies", body.enemies ?? body);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/map" && method === "GET") {
    sendJson(res, 200, { map: kvGet("map") });
    return;
  }
  if (pathname === "/api/map" && method === "PUT") {
    const body = await readJson(req);
    kvSet("map", body.map ?? body);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function handleStatic(req, res) {
  const filePath = safeStaticPath(req.url || "/");
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url || "/";
    if (url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    handleStatic(req, res);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: String(err?.message || err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Глубины: http://127.0.0.1:${PORT}`);
  console.log(`SQLite:  ${getDbPath()}`);
});
