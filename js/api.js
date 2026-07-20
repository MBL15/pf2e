/**
 * Клиент API → SQLite на сервере.
 * Сессия аккаунта остаётся в localStorage (привязка к браузеру).
 */

const API = "/api";

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function request(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${path}: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** @returns {Promise<boolean>} */
export async function pingApi() {
  try {
    const data = await request("/health");
    return !!data?.ok;
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<{
 *   accounts: unknown | null,
 *   characters: unknown | null,
 *   enemies: unknown | null,
 *   map: unknown | null
 * }>}
 */
export async function fetchState() {
  return request("/state");
}

/**
 * @param {Partial<{accounts:unknown,characters:unknown,enemies:unknown,map:unknown}>} partial
 */
export async function putState(partial) {
  return request("/state", { method: "PUT", body: JSON.stringify(partial) });
}

/** @param {unknown} accounts */
export async function putAccounts(accounts) {
  return request("/accounts", { method: "PUT", body: JSON.stringify({ accounts }) });
}

/** @param {unknown} characters */
export async function putCharacters(characters) {
  return request("/characters", { method: "PUT", body: JSON.stringify({ characters }) });
}

/** @param {unknown} enemies */
export async function putEnemies(enemies) {
  return request("/enemies", { method: "PUT", body: JSON.stringify({ enemies }) });
}

/** @param {unknown} map */
export async function putMap(map) {
  return request("/map", { method: "PUT", body: JSON.stringify({ map }) });
}
