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

/** @returns {Promise<{ ok?: boolean, db?: string, features?: string[] } | null>} */
export async function fetchHealth() {
  try {
    return await request("/health");
  } catch {
    return null;
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
 * Публичная регистрация игрока (без входа мастера).
 * @param {{ name: string, characterId?: string|null, pin?: string }} payload
 * @returns {Promise<import('./accounts.js').Account>}
 */
export async function registerAccount(payload) {
  const data = await request("/accounts/register", {
    method: "POST",
    body: JSON.stringify({ ...payload, role: "player" }),
  });
  return /** @type {import('./accounts.js').Account} */ (data.account);
}

/**
 * @param {{ accountId?: string, name?: string, pin: string }} credentials
 * @returns {Promise<import('./accounts.js').Account>}
 */
export async function loginAccount(credentials) {
  const data = await request("/accounts/login", {
    method: "POST",
    body: JSON.stringify(credentials),
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

/**
 * @returns {Promise<{ party: import('./parties.js').Party | null, members: import('./accounts.js').Account[] }>}
 */
export async function fetchPartyMe() {
  return request("/parties/me");
}

/**
 * @param {string} name
 * @returns {Promise<{ party: import('./parties.js').Party, members: import('./accounts.js').Account[] }>}
 */
export async function createParty(name) {
  return request("/parties", { method: "POST", body: JSON.stringify({ name }) });
}

/**
 * @param {string} code
 * @returns {Promise<{ party: import('./parties.js').Party, members: import('./accounts.js').Account[] }>}
 */
export async function joinParty(code) {
  return request("/parties/join", { method: "POST", body: JSON.stringify({ code }) });
}

/** @returns {Promise<void>} */
export async function leaveParty() {
  await request("/parties/leave", { method: "POST", body: "{}" });
}

/**
 * @param {string} characterId
 * @returns {Promise<import('./accounts.js').Account>}
 */
export async function selectPartyHero(characterId) {
  const data = await request("/parties/select-hero", {
    method: "POST",
    body: JSON.stringify({ characterId }),
  });
  return /** @type {import('./accounts.js').Account} */ (data.account);
}
