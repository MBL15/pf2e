/**
 * Клиент API → Python-сервер + SQLite.
 * Сессия аккаунта — HttpOnly-cookie на сервере.
 */

const API = "/api";

const fetchOpts = { credentials: "same-origin" };

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function request(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...fetchOpts,
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

/** @returns {Promise<import('./accounts.js').Account[]>} */
export async function fetchAccounts() {
  const data = await request("/accounts");
  return /** @type {import('./accounts.js').Account[]} */ (data.accounts || []);
}

/** @returns {Promise<import('./accounts.js').Account | null>} */
export async function fetchMe() {
  try {
    const data = await request("/accounts/me");
    return /** @type {import('./accounts.js').Account} */ (data.account);
  } catch {
    return null;
  }
}

/**
 * @param {{ name: string, role: 'master'|'player', characterId?: string|null, pin?: string }} payload
 * @returns {Promise<import('./accounts.js').Account>}
 */
export async function createAccount(payload) {
  const data = await request("/accounts", { method: "POST", body: JSON.stringify(payload) });
  return /** @type {import('./accounts.js').Account} */ (data.account);
}

/**
 * @param {string} accountId
 * @param {string} pin
 * @returns {Promise<import('./accounts.js').Account>}
 */
export async function loginAccount(accountId, pin) {
  const data = await request("/accounts/login", {
    method: "POST",
    body: JSON.stringify({ accountId, pin }),
  });
  return /** @type {import('./accounts.js').Account} */ (data.account);
}

/** @returns {Promise<void>} */
export async function logoutAccount() {
  await request("/accounts/logout", { method: "POST", body: "{}" });
}

/** @param {string} characterId */
export async function unlinkCharacterFromAccountsApi(characterId) {
  await request("/accounts/unlink-character", {
    method: "POST",
    body: JSON.stringify({ characterId }),
  });
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
