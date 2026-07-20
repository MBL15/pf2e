import { putAccounts } from "./api.js";

const ACCOUNTS_KEY = "glubiny-accounts-v1";
const SESSION_KEY = "glubiny-session-v1";

/**
 * @typedef {Object} Account
 * @property {string} id
 * @property {string} name
 * @property {'master'|'player'} role
 * @property {string|null} characterId
 * @property {string} pin
 */

/**
 * @param {unknown} raw
 * @returns {Account[]}
 */
export function hydrateAccounts(raw) {
  if (!Array.isArray(raw)) return ensureDefaultMaster([]);
  const list = raw.map(normalizeAccount).filter(Boolean);
  return ensureDefaultMaster(list);
}

/**
 * @returns {Account[]|null}
 */
export function readLegacyAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(normalizeAccount).filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * @param {Account[]} list
 * @returns {Promise<void>}
 */
export async function saveAccounts(list) {
  await putAccounts(list);
}

/**
 * @param {Partial<Account>} data
 * @returns {Account}
 */
export function makeAccount(data = {}) {
  const role = data.role === "player" ? "player" : "master";
  return {
    id: data.id || crypto.randomUUID(),
    name: String(data.name || (role === "master" ? "Мастер" : "Игрок")).trim() || "Без имени",
    role,
    characterId: role === "player" ? data.characterId || null : data.characterId || null,
    pin: String(data.pin || "").trim(),
  };
}

/**
 * @param {unknown} raw
 * @returns {Account|null}
 */
function normalizeAccount(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (!o.id || !o.name) return null;
  return makeAccount({
    id: String(o.id),
    name: String(o.name),
    role: o.role === "player" ? "player" : "master",
    characterId: o.characterId ? String(o.characterId) : null,
    pin: o.pin != null ? String(o.pin) : "",
  });
}

/**
 * @param {Account[]} list
 */
function ensureDefaultMaster(list) {
  if (list.some((a) => a.role === "master")) return list;
  const master = makeAccount({ name: "Мастер", role: "master", pin: "" });
  return [master, ...list];
}

/**
 * @returns {string|null}
 */
export function getSessionAccountId() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.accountId ? String(parsed.accountId) : null;
  } catch {
    return null;
  }
}

/**
 * @param {string|null} accountId
 */
export function setSessionAccountId(accountId) {
  if (!accountId) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify({ accountId }));
}

/**
 * @param {Account[]} accounts
 * @returns {Account|null}
 */
export function getCurrentAccount(accounts) {
  const id = getSessionAccountId();
  if (!id) return null;
  return accounts.find((a) => a.id === id) ?? null;
}

/**
 * @param {Account|null|undefined} account
 */
export function isMaster(account) {
  return account?.role === "master";
}

/**
 * @param {Account|null|undefined} account
 */
export function isPlayer(account) {
  return account?.role === "player";
}

/**
 * Мастер — любых героев; игрок — только своего.
 * @param {Account|null|undefined} account
 * @param {string|null|undefined} characterId
 */
export function canEditCharacter(account, characterId) {
  if (!account) return false;
  if (account.role === "master") return true;
  if (!characterId) return false;
  return account.characterId === characterId;
}

/**
 * @param {Account|null|undefined} account
 */
export function canCreateCharacter(account) {
  return isMaster(account);
}

/**
 * @param {Account|null|undefined} account
 * @param {string|null|undefined} characterId
 */
export function canDeleteCharacter(account, characterId) {
  if (!account || !characterId) return false;
  return account.role === "master";
}

/**
 * @param {Account|null|undefined} account
 */
export function canManageEnemies(account) {
  return isMaster(account);
}

/**
 * @param {Account|null|undefined} account
 */
export function canRegenerateMap(account) {
  return isMaster(account);
}

/**
 * @param {Account|null|undefined} account
 */
export function canSwitchMapRole(account) {
  return isMaster(account);
}

/**
 * @param {Account[]} accounts
 * @param {string} characterId
 */
export function unlinkCharacterFromAccounts(accounts, characterId) {
  let changed = false;
  const next = accounts.map((a) => {
    if (a.characterId !== characterId) return a;
    changed = true;
    return { ...a, characterId: null };
  });
  if (changed) void saveAccounts(next);
  return next;
}

/**
 * @param {string} pin
 * @param {Account} account
 */
export function checkPin(account, pin) {
  if (!account.pin) return true;
  return String(pin || "") === account.pin;
}
