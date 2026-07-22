import type { Connection, ConnectionProvider } from '@/lib/types';
import type { NextRequest } from 'next/server';

const SESSION_VERSION = 3;
const SESSION_COOKIE_NAME = 'gitall_session';
const STATE_COOKIE_PREFIX = 'gitall_oauth_state_';
const PROVIDER_TOKEN_COOKIE_PREFIX = 'gitall_token_';
const RETURN_TO_COOKIE_PREFIX = 'gitall_oauth_return_to_';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const STATE_MAX_AGE_SECONDS = 60 * 10;

// AES-GCM auth tag length in bytes
const TAG_LENGTH = 16;

// Connection as stored in the session cookie — no access token to keep the
// cookie small. Tokens are stored in separate per-provider cookies.
interface StoredConnection {
  provider: ConnectionProvider;
  accountId: string;
  username: string;
  avatarUrl: string;
  verifiedAt: number;
}

interface StoredAuthSession {
  version: number;
  primary: ConnectionProvider;
  connections: Partial<Record<ConnectionProvider, StoredConnection>>;
  expiresAt: number;
  userId?: string;
}

export interface AuthSession {
  primary: ConnectionProvider;
  connections: Partial<Record<ConnectionProvider, Connection>>;
  /** D1 user id — populated after the first successful profile upsert. */
  userId?: string;
}

export {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  PROVIDER_TOKEN_COOKIE_PREFIX,
};
export { SESSION_VERSION, STATE_MAX_AGE_SECONDS };

// ── Helpers ──────────────────────────────────────────────────────────

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array<ArrayBuffer> {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (base64.length % 4)) % 4;
  if (paddingLength === 3) {
    throw new Error('Invalid base64url string');
  }

  const padded = `${base64}${'='.repeat(paddingLength)}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Public utilities ─────────────────────────────────────────────────

export function createOAuthState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function getStateCookieName(provider: ConnectionProvider) {
  return `${STATE_COOKIE_PREFIX}${provider}`;
}

export function getProviderTokenCookieName(provider: ConnectionProvider) {
  return `${PROVIDER_TOKEN_COOKIE_PREFIX}${provider}`;
}

export function getReturnToCookieName(provider: ConnectionProvider) {
  return `${RETURN_TO_COOKIE_PREFIX}${provider}`;
}

export function mergeConnectionIntoSession(
  session: AuthSession | null,
  connection: Connection,
  userId?: string,
): AuthSession {
  const result: AuthSession = {
    primary: connection.provider,
    connections: {
      ...(session?.connections ?? {}),
      [connection.provider]: connection,
    },
  };
  const resolvedUserId = userId ?? session?.userId;
  if (resolvedUserId) {
    result.userId = resolvedUserId;
  }
  return result;
}

export function removeConnectionFromSession(
  session: AuthSession,
  provider: ConnectionProvider,
): AuthSession | null {
  const connections = { ...session.connections };
  delete connections[provider];

  const remainingProviders = Object.entries(connections)
    .filter((entry): entry is [string, Connection] => entry[1] !== undefined)
    .map(([connectionProvider]) => connectionProvider as ConnectionProvider);

  if (remainingProviders.length === 0) {
    return null;
  }

  const result: AuthSession = {
    primary:
      session.primary === provider ? remainingProviders[0] : session.primary,
    connections,
  };
  if (session.userId) {
    result.userId = session.userId;
  }
  return result;
}

function isConnectionProvider(value: unknown): value is ConnectionProvider {
  return value === 'github' || value === 'gitlab' || value === 'bitbucket';
}

function isValidConnection(
  provider: ConnectionProvider,
  connection: unknown,
): connection is StoredConnection {
  if (!connection || typeof connection !== 'object') {
    return false;
  }

  const candidate = connection as Partial<StoredConnection>;
  return (
    candidate.provider === provider &&
    typeof candidate.accountId === 'string' &&
    candidate.accountId.length > 0 &&
    typeof candidate.username === 'string' &&
    candidate.username.length > 0 &&
    typeof candidate.avatarUrl === 'string' &&
    candidate.avatarUrl.length > 0 &&
    typeof candidate.verifiedAt === 'number' &&
    Number.isFinite(candidate.verifiedAt)
  );
}

// ── Session key ──────────────────────────────────────────────────────

async function getSessionKey(): Promise<CryptoKey | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return null;
  }

  const encoded = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest('SHA-256', encoded);

  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

// ── Encode / Decode ──────────────────────────────────────────────────

// Shared helper: encrypt arbitrary plaintext bytes, returning
// base64url(iv).base64url(tag).base64url(ciphertext)
async function encryptValue(
  key: CryptoKey,
  plaintext: BufferSource,
): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  // Web Crypto AES-GCM returns ciphertext || authTag (tag is last 16 bytes)
  const combined = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
  );

  const encrypted = combined.slice(0, combined.length - TAG_LENGTH);
  const tag = combined.slice(combined.length - TAG_LENGTH);

  return `${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(encrypted)}`;
}

// Shared helper: decrypt a value produced by encryptValue.
async function decryptValue(
  key: CryptoKey,
  value: string,
): Promise<Uint8Array | null> {
  const parts = value.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [ivPart, tagPart, encryptedPart] = parts;

  try {
    const iv = fromBase64Url(ivPart);
    const tag = fromBase64Url(tagPart);
    const encrypted = fromBase64Url(encryptedPart);

    // Web Crypto expects ciphertext || authTag concatenated
    const combined = new Uint8Array(encrypted.length + tag.length);
    combined.set(encrypted);
    combined.set(tag, encrypted.length);

    return new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined),
    );
  } catch {
    return null;
  }
}

export async function encodeAuthSession(
  session: AuthSession,
): Promise<string | null> {
  const key = await getSessionKey();
  if (!key) {
    return null;
  }

  // Strip accessToken from each connection before storing. Access tokens are
  // kept in separate per-provider cookies to stay well under the 4096-byte
  // per-cookie limit (Bitbucket tokens are especially large).
  const storedConnections: Partial<
    Record<ConnectionProvider, StoredConnection>
  > = {};
  for (const [provider, connection] of Object.entries(session.connections)) {
    if (connection !== undefined) {
      const p = provider as ConnectionProvider;
      storedConnections[p] = {
        provider: connection.provider,
        accountId: connection.accountId,
        username: connection.username,
        avatarUrl: connection.avatarUrl,
        verifiedAt: connection.verifiedAt,
      };
    }
  }

  const payload: StoredAuthSession = {
    version: SESSION_VERSION,
    primary: session.primary,
    connections: storedConnections,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  if (session.userId) {
    payload.userId = session.userId;
  }

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  return encryptValue(key, plaintext);
}

/**
 * Encrypt a provider access token for storage in its own HttpOnly cookie.
 * Use {@link getProviderTokenCookieName} for the cookie name.
 */
export async function encodeProviderToken(
  token: string,
): Promise<string | null> {
  const key = await getSessionKey();
  if (!key) {
    return null;
  }

  const plaintext = new TextEncoder().encode(token);
  return encryptValue(key, plaintext);
}

/**
 * Decrypt a provider token that was stored with {@link encodeProviderToken}.
 */
export async function decodeProviderToken(
  value: string | undefined,
): Promise<string | null> {
  if (!value) {
    return null;
  }

  const key = await getSessionKey();
  if (!key) {
    return null;
  }

  const decrypted = await decryptValue(key, value);
  if (!decrypted) {
    return null;
  }

  const token = new TextDecoder().decode(decrypted);
  return token.length > 0 ? token : null;
}

export async function decodeAuthSession(
  value: string | undefined,
): Promise<AuthSession | null> {
  if (!value) {
    return null;
  }

  const key = await getSessionKey();
  if (!key) {
    return null;
  }

  const decrypted = await decryptValue(key, value);
  if (!decrypted) {
    return null;
  }

  try {
    const session = JSON.parse(
      new TextDecoder().decode(decrypted),
    ) as StoredAuthSession;

    if (
      session.version !== SESSION_VERSION ||
      !isConnectionProvider(session.primary) ||
      typeof session.expiresAt !== 'number' ||
      session.expiresAt <= Date.now() ||
      !session.connections ||
      typeof session.connections !== 'object'
    ) {
      return null;
    }

    const connections: Partial<Record<ConnectionProvider, Connection>> = {};
    for (const [provider, connection] of Object.entries(session.connections)) {
      if (
        !isConnectionProvider(provider) ||
        !isValidConnection(provider, connection)
      ) {
        return null;
      }
      connections[provider] = connection;
    }

    if (
      Object.keys(connections).length === 0 ||
      !connections[session.primary]
    ) {
      return null;
    }

    const result: AuthSession = { primary: session.primary, connections };
    if (typeof session.userId === 'string' && session.userId.length > 0) {
      result.userId = session.userId;
    }
    return result;
  } catch {
    return null;
  }
}

export async function getAuthSessionFromRequest(
  request: NextRequest,
): Promise<AuthSession | null> {
  return decodeAuthSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

/**
 * Read and decrypt a provider's access token from its dedicated HttpOnly
 * cookie (set by the OAuth callback). Returns null if the cookie is absent,
 * tampered, or the session key is unavailable.
 */
export async function getProviderTokenFromRequest(
  request: NextRequest,
  provider: ConnectionProvider,
): Promise<string | null> {
  return decodeProviderToken(
    request.cookies.get(getProviderTokenCookieName(provider))?.value,
  );
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  return decodeAuthSession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}
