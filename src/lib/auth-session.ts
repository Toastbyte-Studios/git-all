import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import type { NextRequest } from 'next/server';

const SESSION_VERSION = 1;
const SESSION_COOKIE_NAME = 'github_oauth_session';
const STATE_COOKIE_NAME = 'github_oauth_state';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const STATE_MAX_AGE_SECONDS = 60 * 10;

interface SessionUser {
  login: string;
  avatarUrl: string;
}

interface StoredAuthSession {
  version: number;
  accessToken: string;
  user: SessionUser;
  expiresAt: number;
}

export interface AuthSession {
  accessToken: string;
  user: SessionUser;
}

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS };
export { STATE_COOKIE_NAME, STATE_MAX_AGE_SECONDS };

export function hasGithubOAuthConfig() {
  return Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  );
}

export function createOAuthState() {
  return randomBytes(16).toString('base64url');
}

function getSessionKey() {
  const secret = process.env.GITHUB_CLIENT_SECRET;
  if (!secret) {
    return null;
  }

  return createHash('sha256').update(secret).digest();
}

export function encodeAuthSession(session: AuthSession) {
  const key = getSessionKey();
  if (!key) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const payload: StoredAuthSession = {
    version: SESSION_VERSION,
    accessToken: session.accessToken,
    user: session.user,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decodeAuthSession(value: string | undefined) {
  if (!value) {
    return null;
  }

  const key = getSessionKey();
  if (!key) {
    return null;
  }

  const parts = value.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [ivPart, tagPart, encryptedPart] = parts;

  try {
    const iv = Buffer.from(ivPart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    const encrypted = Buffer.from(encryptedPart, 'base64url');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');

    const session = JSON.parse(decrypted) as StoredAuthSession;

    if (
      session.version !== SESSION_VERSION ||
      !session.accessToken ||
      !session.user?.login ||
      !session.user?.avatarUrl ||
      session.expiresAt <= Date.now()
    ) {
      return null;
    }

    return { accessToken: session.accessToken, user: session.user };
  } catch {
    return null;
  }
}

export function getAuthSessionFromRequest(request: NextRequest) {
  return decodeAuthSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}
