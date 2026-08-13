import { cache } from 'react';
import { getDb } from '@/lib/db';
import type {
  ConnectionProvider,
  Profile,
  PublicProfile,
  StoredConnection,
} from '@/lib/types';

// ── ULID generation ──────────────────────────────────────────────

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

// ── Handle rules ─────────────────────────────────────────────────

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

  const truncated = candidate.slice(0, 32).replace(/-+$/, '');

  if (truncated.length < 2) {
    return null;
  }
  return truncated;
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
  return HANDLE_PATTERN.test(handle);
}

// ── D1 row shapes ───────────────────────────────────────────────

interface UserRow {
  id: string;
  handle: string;
  display_name: string | null;
  primary_provider: string;
  handle_changed_at: number | null;
  is_public: number;
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

// ── Exported helpers ────────────────────────────────────────────

/**
 * Checks whether `handle` is available: syntactically valid, not reserved, not
 * already taken in D1, and not a handle somebody else previously released.
 *
 * Pass `forUserId` to let a user reclaim a handle they retired themselves —
 * without it, renaming away from a handle would lock you out of renaming back.
 *
 * If the DB is unavailable the check is skipped and `true` is returned so the
 * rest of the auth flow is not blocked.
 */
export async function isHandleAvailable(
  handle: string,
  forUserId?: string,
): Promise<boolean> {
  if (!isValidHandleFormat(handle)) return false;

  const db = getDb();
  if (!db) return true;

  const row = await db
    .prepare('SELECT 1 FROM users WHERE handle = ?1 LIMIT 1')
    .bind(handle)
    .first();
  if (row !== null) return false;

  // Retired handles stay reserved to whoever released them. See
  // migrations/0004_handle_history.sql — recycling a handle that is already
  // embedded in somebody's README hands the new owner that embed.
  const retired = await db
    .prepare('SELECT user_id FROM handle_history WHERE handle = ?1 LIMIT 1')
    .bind(handle)
    .first<{ user_id: string }>();

  if (retired === null) return true;
  return forUserId !== undefined && retired.user_id === forUserId;
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
    const suffixStr = `-${suffix}`;
    const trimmedBase = normalized
      .slice(0, 32 - suffixStr.length)
      .replace(/-+$/, '');
    candidate = `${trimmedBase}${suffixStr}`;
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

  // `is_public` is named and written explicitly rather than left to the column
  // default. Migration 0002 created the column with DEFAULT 1, and that default
  // cannot be changed without rebuilding the table (see 0003 for why we don't).
  // Signing in must never publish a profile, so 0 is written here directly.
  await db
    .prepare(
      `INSERT INTO users (id, handle, display_name, primary_provider, handle_changed_at, is_public, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, NULL, 0, ?5, ?6)`,
    )
    .bind(newId, handle, username, primaryProvider, now, now)
    .run();

  return newId;
}

/**
 * Upserts a `connections` row for `(userId, provider)`.
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
         account_id = excluded.account_id,
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
 * Returns the full `Profile` for `handle`, including all connections and the
 * `is_public` flag, regardless of visibility.
 *
 * This is the **owner/authenticated** read path — it returns internal fields
 * (`id`, `handleChangedAt`) and does not filter on visibility. Do not hand the
 * result to a client component; project it through {@link toPublicProfile}
 * first, or use {@link getPublicProfileByHandle} instead.
 *
 * Memoised with React's `cache()` for the duration of a single request.
 * `/u/[handle]` reads the profile twice — once in `generateMetadata()` and once
 * in the page body — and without this that is two round-trips, four D1 queries,
 * for one page view. `cache()` is per-request and per-argument, so nothing is
 * ever shared between visitors or between handles; outside a request scope
 * (route handlers, tests) it degrades to a plain call.
 *
 * Returns `null` if no user with that handle exists. A handle the owner has
 * since renamed away from is *not* resolved here — see
 * {@link resolvePublicHandleRedirect}, which is deliberately a separate lookup
 * so this function never silently returns a profile under a stale name.
 */
export const getProfileByHandle = cache(async function getProfileByHandle(
  handle: string,
): Promise<Profile | null> {
  const db = getDb();
  if (!db) return null;
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return null;

  const userRow = await db
    .prepare('SELECT * FROM users WHERE handle = ?1 LIMIT 1')
    .bind(normalizedHandle)
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
    isPublic: userRow.is_public !== 0,
    createdAt: userRow.created_at,
    updatedAt: userRow.updated_at,
    connections,
  };
});

/**
 * Resolves a retired handle to its owner's **current** handle, so links and
 * embeds shared before a rename keep working.
 *
 * Returns `null` — meaning "no redirect, render the normal not-found" — when:
 *
 * - the handle was never released, or
 * - the owner's profile is private. A redirect that fired for a private
 *   profile would confirm the account exists, which is exactly the oracle that
 *   {@link getPublicProfileByHandle} is written to avoid. The old handle has
 *   to look as dead as any handle nobody ever registered.
 * - the owner has since renamed *back* to this handle. That case is already
 *   handled by the normal lookup, and redirecting would bounce a request to
 *   the handle it started from.
 *
 * This does leak that a public account once used this handle. The target is
 * public and already enumerated in the sitemap, so there is nothing here that
 * a visitor could not find by other means.
 */
export async function resolvePublicHandleRedirect(
  handle: string,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return null;

  const row = await db
    .prepare(
      `SELECT u.handle AS handle, u.is_public AS is_public
         FROM handle_history h
         JOIN users u ON u.id = h.user_id
        WHERE h.handle = ?1
        LIMIT 1`,
    )
    .bind(normalizedHandle)
    .first<{ handle: string; is_public: number }>();

  if (!row) return null;
  if (row.is_public === 0) return null;
  if (row.handle === normalizedHandle) return null;

  return row.handle;
}

/**
 * Narrows a stored `Profile` to the fields that are safe to serialise into a
 * public page payload.
 *
 * This is the one place the public/private boundary is drawn. It is an
 * allow-list, not a delete-list: a column added to `users` later does not
 * silently become public.
 */
export function toPublicProfile(profile: Profile): PublicProfile {
  return {
    handle: profile.handle,
    displayName: profile.displayName,
    primaryProvider: profile.primaryProvider,
    connections: profile.connections.map((connection) => ({
      provider: connection.provider,
      username: connection.username,
      avatarUrl: connection.avatarUrl,
    })),
  };
}

export interface PublicProfileWithUpdatedAt extends PublicProfile {
  updatedAt: number;
}

/**
 * Returns the public projection of `handle`, or `null` if the profile does not
 * exist **or is private**.
 *
 * Callers cannot distinguish the two cases, which is intentional: a response
 * that confirms a private handle exists leaks the existence of an account for
 * any guessable username. Render a 404 for `null`, never a 403.
 */
export async function getPublicProfileByHandle(
  handle: string,
): Promise<PublicProfile | null> {
  const profile = await getProfileByHandle(handle);
  if (!profile || !profile.isPublic) return null;
  return toPublicProfile(profile);
}

/**
 * Returns the public projection of `handle` plus `updatedAt`, or `null` if the
 * profile does not exist **or is private**.
 *
 * This preserves the same "private and missing are indistinguishable" contract
 * as {@link getPublicProfileByHandle}, while letting internal callers version a
 * cache key from the profile row.
 */
export async function getPublicProfileWithUpdatedAtByHandle(
  handle: string,
): Promise<PublicProfileWithUpdatedAt | null> {
  const profile = await getProfileByHandle(handle);
  if (!profile || !profile.isPublic) return null;
  return {
    ...toPublicProfile(profile),
    updatedAt: profile.updatedAt,
  };
}

/**
 * Sets the public visibility of a profile.
 * Returns `false` when the DB is unavailable.
 */
export async function setVisibility(
  userId: string,
  isPublic: boolean,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  await db
    .prepare('UPDATE users SET is_public = ?1, updated_at = ?2 WHERE id = ?3')
    .bind(isPublic ? 1 : 0, Date.now(), userId)
    .run();

  return true;
}

/**
 * Deletes a user, every connection belonging to them, and every handle they
 * have released.
 *
 * `connections.user_id` and `handle_history.user_id` are both declared
 * ON DELETE CASCADE, so deleting the `users` row alone *should* be sufficient —
 * but SQLite only enforces foreign keys when `PRAGMA foreign_keys = ON`, and
 * D1's behaviour here is not something we want an erasure path to depend on.
 * All three deletes are therefore issued explicitly, in one `batch()` so they
 * share a transaction. This is correct whether or not the cascade fires; if it
 * does, the later statements simply remove nothing.
 *
 * Deleting the history rows also releases those handles back into the pool,
 * which is the right outcome: reservation exists to protect a live account's
 * embeds, and there is no longer an account to protect.
 *
 * Returns `false` when the DB is unavailable.
 */
export async function deleteUser(userId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  await db.batch([
    db.prepare('DELETE FROM connections WHERE user_id = ?1').bind(userId),
    db.prepare('DELETE FROM handle_history WHERE user_id = ?1').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?1').bind(userId),
  ]);

  return true;
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

/**
 * Returns the handle and visibility flag for a user by their D1 user id, for
 * rendering the owner's own settings UI.
 * Returns `null` if not found or if the DB is unavailable.
 */
export async function getProfileSummaryByUserId(
  userId: string,
): Promise<{ handle: string; isPublic: boolean } | null> {
  const db = getDb();
  if (!db) return null;

  const row = await db
    .prepare('SELECT handle, is_public FROM users WHERE id = ?1 LIMIT 1')
    .bind(userId)
    .first<Pick<UserRow, 'handle' | 'is_public'>>();

  if (!row) return null;
  return { handle: row.handle, isPublic: row.is_public !== 0 };
}

/**
 * Changes the handle for `userId`.
 *
 * The outgoing handle is recorded in `handle_history` in the same batch as the
 * rename, which is what keeps already-shared `/u/<old>` links and
 * `/embed/u/<old>.svg` URLs resolving, and stops anybody else registering it.
 * If the incoming handle is one this same user previously released, its history
 * row is dropped — you can always rename back to your own old handle.
 *
 * Returns:
 * - `{ ok: true }` on success
 * - `{ ok: false, reason: 'invalid' }` — handle doesn't pass syntax rules
 * - `{ ok: false, reason: 'taken' }` — handle in use, or reserved to another user
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

  // Check current handle + cooldown (only enforced when the handle actually changes)
  const userRow = await db
    .prepare(
      'SELECT handle, handle_changed_at FROM users WHERE id = ?1 LIMIT 1',
    )
    .bind(userId)
    .first<Pick<UserRow, 'handle' | 'handle_changed_at'>>();

  if (userRow?.handle === newHandle) {
    return { ok: true };
  }

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

  // A handle somebody else released is not free. Reported as 'taken' on
  // purpose — distinguishing "reserved by a previous owner" would tell a
  // stranger that some account once used it.
  const retired = await db
    .prepare('SELECT user_id FROM handle_history WHERE handle = ?1 LIMIT 1')
    .bind(newHandle)
    .first<{ user_id: string }>();

  if (retired !== null && retired.user_id !== userId) {
    return { ok: false, reason: 'taken' };
  }

  const now = Date.now();
  const statements = [];

  // Record the outgoing handle first. `userRow` is null only when the user row
  // has vanished mid-request, in which case there is no old handle to retire
  // and the UPDATE below is a no-op anyway.
  if (userRow?.handle) {
    statements.push(
      db
        .prepare(
          `INSERT INTO handle_history (handle, user_id, released_at)
           VALUES (?1, ?2, ?3)
           ON CONFLICT(handle) DO UPDATE SET
             user_id = excluded.user_id,
             released_at = excluded.released_at`,
        )
        .bind(userRow.handle, userId, now),
    );
  }

  // Reclaiming one of your own retired handles: drop the history row so the
  // handle is not simultaneously current and released.
  statements.push(
    db
      .prepare('DELETE FROM handle_history WHERE handle = ?1 AND user_id = ?2')
      .bind(newHandle, userId),
  );

  statements.push(
    db
      .prepare(
        'UPDATE users SET handle = ?1, handle_changed_at = ?2, updated_at = ?3 WHERE id = ?4',
      )
      .bind(newHandle, now, now, userId),
  );

  // One batch, one transaction. A partial apply here would either strand the
  // old handle unreserved or reserve it without performing the rename.
  await db.batch(statements);

  return { ok: true };
}

/**
 * Returns all public handles with their `updated_at` timestamps for sitemap
 * generation.
 *
 * Only current handles are listed. Retired handles resolve via a temporary
 * redirect and must stay out of the sitemap — submitting a URL that 302s is
 * the kind of thing that quietly costs crawl budget.
 *
 * Note: this enumerates directly from D1 and is fine at current volume.
 * Past a few thousand public handles this should use `generateSitemaps()`
 * chunking with a paginated query (LIMIT / OFFSET or cursor-based).
 */
export async function getPublicHandlesForSitemap(): Promise<
  Array<{ handle: string; updatedAt: number }>
> {
  const db = getDb();
  if (!db) return [];

  const { results } = await db
    .prepare(
      'SELECT handle, updated_at FROM users WHERE is_public = 1 ORDER BY updated_at DESC',
    )
    .all<{ handle: string; updated_at: number }>();

  return results.map((r) => ({ handle: r.handle, updatedAt: r.updated_at }));
}

function isConnectionProvider(value: string): value is ConnectionProvider {
  return value === 'github' || value === 'gitlab' || value === 'bitbucket';
}
