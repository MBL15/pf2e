import {
  createAccount as apiCreateAccount,
  fetchAccounts,
  loginAccount,
  logoutAccount,
  unlinkCharacterFromAccountsApi,
} from "./api.js";

const ACCOUNTS_KEY = "glubiny-accounts-v1";

/**
 * @typedef {Object} Account
 * @property {string} id
 * @property {string} name
 * @property {'master'|'player'} role
 * @property {string|null} characterId
 * @property {boolean} [hasPin]
 */

/**
 * @param {unknown} raw
 * @returns {Account[]}
 */
export function hydrateAccounts(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeAccount).filter(Boolean);
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
    return parsed.map(normalizeLegacyAccount).filter(Boolean);
  } catch {
    return null;
  }
}

/** @returns {Promise<Account[]>} */
export async function loadAccounts() {
  return fetchAccounts();
}

/**
 * @param {{ name: string, role: 'master'|'player', characterId?: string|null, pin?: string }} data
 * @returns {Promise<Account>}
 */
export async function createAccount(data) {
  return apiCreateAccount(data);
}

/**
 * @param {string} accountId
 * @param {string} pin
 * @returns {Promise<Account>}
 */
export async function loginAsAccount(accountId, pin) {
  return loginAccount(accountId, pin);
}

/** @returns {Promise<void>} */
export async function logoutCurrentAccount() {
  await logoutAccount();
}

/**
 * @param {string} characterId
 * @returns {Promise<void>}
 */
export async function unlinkCharacterFromAccounts(characterId) {
  await unlinkCharacterFromAccountsApi(characterId);
}

/**
 * @param {unknown} raw
 * @returns {Account|null}
 */
function normalizeAccount(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (!o.id || !o.name) return null;
  const role = o.role === "player" ? "player" : "master";
  return {
    id: String(o.id),
    name: String(o.name),
    role,
    characterId: o.characterId ? String(o.characterId) : null,
    hasPin: Boolean(o.hasPin),
  };
}

/**
 * @param {unknown} raw
 * @returns {Account|null}
 */
function normalizeLegacyAccount(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (!o.id || !o.name) return null;
  const role = o.role === "player" ? "player" : "master";
  return {
    id: String(o.id),
    name: String(o.name),
    role,
    characterId: o.characterId ? String(o.characterId) : null,
    hasPin: Boolean(o.pin),
  };
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
 * @param {Account} account
 */
export function accountNeedsPin(account) {
  return Boolean(account.hasPin);
}
