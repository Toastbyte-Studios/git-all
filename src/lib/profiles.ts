import { getDb } from '@/lib/db';
import type {
  ConnectionProvider,
  Profile,
  StoredConnection,
} from '@/lib/types';

// ── ULID generation ───────────────────────────────────────────────────

const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generates a ULID-format identifier (26 chars, Crockford base32).
 * Time-sortable: first 10 chars encode the current ms timestamp.
 */
export function generateId(): string {
  const now = Date.now();

  // 10 chars — timestamp (48-bit, base32, 5 bits per char)
  const timeChars: string[] = new Array(10);
  let t = now;
  for (let i = 9; i >= 0; i--) {
    timeChars[i] = ULID_CHARS[t % 32];
    t = Math.floor(t / 32);
  }

  // 16 chars — random (80-bit: 10 bytes → 16 base32 chars, 5 bits each)
  // Process without BigInt (not available in ES2017 target) by extracting
  // 5-bit windows across the byte array.
  const randBytes = crypto.getRandomValues(new Uint8Array(10));
  const randChars: string[] = new Array(16);
  for (let i = 0; i < 16; i++) {
    // Bit offset for this char: i * 5
    const bitOffset = i * 5;
    const byteIndex = Math.floor(bitOffset / 8);
    const bitShift = bitOffset % 8;
    // Read up to two bytes to get 5 bits
    const lo = randBytes[byteIndex] ?? 0;
    const hi = randBytes[byteIndex + 1] ?? 0;
    const combined = (lo << 8) | hi;
    randChars[i] = ULID_CHARS[(combined >> (11 - bitShift)) & 0x1f];
  }

  return timeChars.join('') + randChars.join('');
}

// ── Handle rules ──────────────────────────────────────────────────────

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$|^[a-z0-9]{2,3}$/;
const CONSECUTIVE_DASH = /--/;

export const RESERVED_HANDLES = new Set([
  'me',
  'u',
  'api',
  'embed',
  'embeds',
  'settings',
  'admin',
  'login',
  'logout',
  'signin',
  'signup',
  'about',
  'pricing',
  'team',
  'teams',
  'dashboard',
  'auth',
  'static',
  'assets',
  'public',
  '_next',
]);

/** Seven days in milliseconds — minimum gap between handle changes. */
export const HANDLE_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Derives a candidate handle from a provider username:
 * lowercase, `_` → `-`, strip other non-[a-z0-9-] chars, trim leading/trailing dashes.
 * Returns `null` if no valid characters remain.
 */
export function normalizeHandle(username: string): string | null {
  const candidate = username
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .replace(/--+/g, '-');

  if (candidate.length < 2) {
    return null;
  }
  return candidate.slice(0, 32);
}

/**
 * Returns true when `handle` satisfies all syntactic rules:
 * - 2–32 chars
 * - `[a-z0-9-]` only
 * - no leading/trailing dashes
 * - no consecutive `--`
 * - not a reserved word
 */
export function isValidHandleFormat(handle: string): boolean {
  if (handle.length < 2 || handle.length > 32) return false;
  if (!/^[a-z0-9-]+$/.test(handle)) return false;
  if (handle.startsWith('-') || handle.endsWith('-')) return false;
  if (CONSECUTIVE_DASH.test(handle)) return false;
  if (RESERVED_HANDLES.has(handle)) return false;
  // Ensure the regex matches (catches single-char edge-case)
  return HANDLE_PATTERN.test(handle) || handle.length >= 2;
}

// ── D1 row shapes ─────────────────────────────────────────────────────

interface UserRow {
  id: string;
  handle: string;
  display_name: string | null;
  primary_provider: string;
  handle_changed_at: number | null;
  created_at: number;
  updated_at: number;
}

interface ConnectionRow {
  user_id: string;
  provider: string;
  account_id: string;
  username: string;
  avatar_url: string | null;
  verified_at: number;
}

// ── Exported helpers ──────────────────────────────────────────────────

/**
 * Checks whether `handle` is available (syntactically valid, not reserved,
 * and not already taken in D1).  If the DB is unavailable the check is skipped
 * and `true` is returned so the rest of the auth flow is not blocked.
 */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  if (!isValidHandleFormat(handle)) return false;

  const db = getDb();
  if (!db) return true;

  const row = await db
    .prepare('SELECT 1 FROM users WHERE handle = ?1 LIMIT 1')
    .bind(handle)
    .first();
  return row === null;
}

/**
 * Picks the first available handle starting from `base`, appending `-2`, `-3`
 * etc. if the base is taken or reserved.
 */
export async function findAvailableHandle(base: string): Promise<string> {
  const normalized = normalizeHandle(base) ?? 'user';
  let candidate = normalized;
  let suffix = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await isHandleAvailable(candidate)) {
      return candidate;
    }
    candidate = `${normalized.slice(0, 29)}-${suffix}`;
    suffix++;
  }
}

/**
 * Upserts a `users` row.  If `userId` is supplied the existing row is updated;
 * otherwise a new user is inserted with a derived handle.
 *
 * Returns the `userId` (existing or newly created).
 */
export async function upsertUser(
  userId: string | undefined,
  primaryProvider: ConnectionProvider,
  username: string,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  const now = Date.now();

  if (userId) {
    // Touch updated_at to keep the row fresh.
    await db
      .prepare('UPDATE users SET updated_at = ?1 WHERE id = ?2')
      .bind(now, userId)
      .run();
    return userId;
  }

  // New user — derive a unique handle from the provider username.
  const handle = await findAvailableHandle(username);
  const newId = generateId();

  await db
    .prepare(
      `INSERT INTO users (id, handle, display_name, primary_provider, handle_changed_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6)`,
    )
    .bind(newId, handle, username, primaryProvider, now, now)
    .run();

  return newId;
}

/**
 * Upserts a `connections` row for `(userId, provider)`.
 * Also looks up an existing user by `(provider, accountId)` if `userId` is
 * not yet known — returns `{ userId }` so the caller can persist it in the
 * session.
 */
export async function upsertConnection(
  userId: string,
  provider: ConnectionProvider,
  identity: {
    accountId: string;
    username: string;
    avatarUrl: string;
  },
): Promise<void> {
  const db = getDb();
  if (!db) return;

  const now = Date.now();

  await db
    .prepare(
      `INSERT INTO connections (user_id, provider, account_id, username, avatar_url, verified_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         username   = excluded.username,
         avatar_url = excluded.avatar_url,
         verified_at = excluded.verified_at`,
    )
    .bind(
      userId,
      provider,
      identity.accountId,
      identity.username,
      identity.avatarUrl,
      now,
    )
    .run();
}

/**
 * Looks up a user by `(provider, accountId)` via the connections table.
 * Returns the `userId` string, or `null` if not found.
 */
export async function findUserByProviderAccount(
  provider: ConnectionProvider,
  accountId: string,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  const row = await db
    .prepare(
      'SELECT user_id FROM connections WHERE provider = ?1 AND account_id = ?2 LIMIT 1',
    )
    .bind(provider, accountId)
    .first<{ user_id: string }>();

  return row?.user_id ?? null;
}

/**
 * Returns the full `Profile` for `handle`, including all connections.
 * Returns `null` if no user with that handle exists.
 */
export async function getProfileByHandle(
  handle: string,
): Promise<Profile | null> {
  const db = getDb();
  if (!db) return null;

  const userRow = await db
    .prepare('SELECT * FROM users WHERE handle = ?1 LIMIT 1')
    .bind(handle)
    .first<UserRow>();

  if (!userRow) return null;

  const { results: connectionRows } = await db
    .prepare('SELECT * FROM connections WHERE user_id = ?1')
    .bind(userRow.id)
    .all<ConnectionRow>();

  const connections: StoredConnection[] = connectionRows
    .filter((r) => isConnectionProvider(r.provider))
    .map((r) => ({
      userId: r.user_id,
      provider: r.provider as ConnectionProvider,
      accountId: r.account_id,
      username: r.username,
      avatarUrl: r.avatar_url,
      verifiedAt: r.verified_at,
    }));

  return {
    id: userRow.id,
    handle: userRow.handle,
    displayName: userRow.display_name,
    primaryProvider: userRow.primary_provider as ConnectionProvider,
    handleChangedAt: userRow.handle_changed_at,
    createdAt: userRow.created_at,
    updatedAt: userRow.updated_at,
    connections,
  };
}

/**
 * Changes the handle for `userId`.
 *
 * Returns:
 * - `{ ok: true }` on success
 * - `{ ok: false, reason: 'invalid' }` — handle doesn't pass syntax rules
 * - `{ ok: false, reason: 'taken' }` — handle already in use
 * - `{ ok: false, reason: 'cooldown', nextAllowedAt: number }` — changed too recently
 * - `{ ok: false, reason: 'no_db' }` — DB unavailable
 */
export async function setHandle(
  userId: string,
  newHandle: string,
): Promise<
  | { ok: true }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'taken' }
  | { ok: false; reason: 'cooldown'; nextAllowedAt: number }
  | { ok: false; reason: 'no_db' }
> {
  if (!isValidHandleFormat(newHandle)) {
    return { ok: false, reason: 'invalid' };
  }

  const db = getDb();
  if (!db) return { ok: false, reason: 'no_db' };

  // Check cooldown
  const userRow = await db
    .prepare('SELECT handle_changed_at FROM users WHERE id = ?1 LIMIT 1')
    .bind(userId)
    .first<Pick<UserRow, 'handle_changed_at'>>();

  if (
    userRow?.handle_changed_at !== null &&
    userRow?.handle_changed_at !== undefined
  ) {
    const elapsed = Date.now() - userRow.handle_changed_at;
    if (elapsed < HANDLE_CHANGE_COOLDOWN_MS) {
      return {
        ok: false,
        reason: 'cooldown',
        nextAllowedAt: userRow.handle_changed_at + HANDLE_CHANGE_COOLDOWN_MS,
      };
    }
  }

  // Check availability
  const taken = await db
    .prepare('SELECT id FROM users WHERE handle = ?1 AND id != ?2 LIMIT 1')
    .bind(newHandle, userId)
    .first();

  if (taken !== null) {
    return { ok: false, reason: 'taken' };
  }

  const now = Date.now();
  await db
    .prepare(
      'UPDATE users SET handle = ?1, handle_changed_at = ?2, updated_at = ?3 WHERE id = ?4',
    )
    .bind(newHandle, now, now, userId)
    .run();

  return { ok: true };
}

/**
 * Returns the handle for a user by their D1 user id.
 * Returns `null` if not found or if the DB is unavailable.
 */
export async function getHandleByUserId(
  userId: string,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  const row = await db
    .prepare('SELECT handle FROM users WHERE id = ?1 LIMIT 1')
    .bind(userId)
    .first<{ handle: string }>();

  return row?.handle ?? null;
}

function isConnectionProvider(value: string): value is ConnectionProvider {
  return value === 'github' || value === 'gitlab' || value === 'bitbucket';
}
