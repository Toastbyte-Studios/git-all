import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  encodeAuthSession,
  decodeAuthSession,
  createOAuthState,
  hasGithubOAuthConfig,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  STATE_COOKIE_NAME,
  STATE_MAX_AGE_SECONDS,
  type AuthSession,
} from '../auth-session';

const TEST_SECRET = 'test-secret-value-for-unit-tests-only';

const SAMPLE_SESSION: AuthSession = {
  accessToken: 'gho_testtoken123',
  user: {
    login: 'testuser',
    avatarUrl: 'https://avatars.githubusercontent.com/u/123',
  },
};

function setEnv(secret: string | undefined) {
  if (secret === undefined) {
    delete process.env.GITHUB_CLIENT_SECRET;
  } else {
    process.env.GITHUB_CLIENT_SECRET = secret;
  }
}

describe('constants', () => {
  it('SESSION_COOKIE_NAME is github_oauth_session', () => {
    expect(SESSION_COOKIE_NAME).toBe('github_oauth_session');
  });

  it('SESSION_MAX_AGE_SECONDS is 7 days', () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 7);
  });

  it('STATE_COOKIE_NAME is github_oauth_state', () => {
    expect(STATE_COOKIE_NAME).toBe('github_oauth_state');
  });

  it('STATE_MAX_AGE_SECONDS is 10 minutes', () => {
    expect(STATE_MAX_AGE_SECONDS).toBe(60 * 10);
  });
});

describe('hasGithubOAuthConfig', () => {
  const origClientId = process.env.GITHUB_CLIENT_ID;
  const origClientSecret = process.env.GITHUB_CLIENT_SECRET;

  afterEach(() => {
    if (origClientId === undefined) delete process.env.GITHUB_CLIENT_ID;
    else process.env.GITHUB_CLIENT_ID = origClientId;

    if (origClientSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET;
    else process.env.GITHUB_CLIENT_SECRET = origClientSecret;
  });

  it('returns true when both env vars are set', () => {
    process.env.GITHUB_CLIENT_ID = 'client_id';
    process.env.GITHUB_CLIENT_SECRET = 'client_secret';
    expect(hasGithubOAuthConfig()).toBe(true);
  });

  it('returns false when GITHUB_CLIENT_ID is missing', () => {
    delete process.env.GITHUB_CLIENT_ID;
    process.env.GITHUB_CLIENT_SECRET = 'client_secret';
    expect(hasGithubOAuthConfig()).toBe(false);
  });

  it('returns false when GITHUB_CLIENT_SECRET is missing', () => {
    process.env.GITHUB_CLIENT_ID = 'client_id';
    delete process.env.GITHUB_CLIENT_SECRET;
    expect(hasGithubOAuthConfig()).toBe(false);
  });

  it('returns false when both env vars are missing', () => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    expect(hasGithubOAuthConfig()).toBe(false);
  });
});

describe('createOAuthState', () => {
  it('returns a non-empty string', () => {
    const state = createOAuthState();
    expect(typeof state).toBe('string');
    expect(state.length).toBeGreaterThan(0);
  });

  it('returns different values on each call', () => {
    const a = createOAuthState();
    const b = createOAuthState();
    expect(a).not.toBe(b);
  });

  it('returns a base64url string (no +, /, or = padding)', () => {
    const state = createOAuthState();
    expect(state).not.toMatch(/[+/=]/);
  });

  it('returns a string of reasonable length (16 bytes → ~22 chars base64url)', () => {
    const state = createOAuthState();
    expect(state.length).toBeGreaterThanOrEqual(20);
    expect(state.length).toBeLessThanOrEqual(30);
  });
});

describe('encodeAuthSession / decodeAuthSession roundtrip', () => {
  beforeEach(() => setEnv(TEST_SECRET));
  afterEach(() => setEnv(undefined));

  it('encodes and decodes a session correctly', async () => {
    const token = await encodeAuthSession(SAMPLE_SESSION);
    expect(token).not.toBeNull();

    const decoded = await decodeAuthSession(token!);
    expect(decoded).not.toBeNull();
    expect(decoded!.accessToken).toBe(SAMPLE_SESSION.accessToken);
    expect(decoded!.user.login).toBe(SAMPLE_SESSION.user.login);
    expect(decoded!.user.avatarUrl).toBe(SAMPLE_SESSION.user.avatarUrl);
  });

  it('encoded token is a 3-part dot-separated string', async () => {
    const token = await encodeAuthSession(SAMPLE_SESSION);
    expect(token).not.toBeNull();
    const parts = token!.split('.');
    expect(parts.length).toBe(3);
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
    }
  });

  it('produces different tokens on each encode (random IV)', async () => {
    const token1 = await encodeAuthSession(SAMPLE_SESSION);
    const token2 = await encodeAuthSession(SAMPLE_SESSION);
    expect(token1).not.toBe(token2);
  });

  it('returns null when decoding undefined', async () => {
    expect(await decodeAuthSession(undefined)).toBeNull();
  });

  it('returns null when decoding an empty string', async () => {
    expect(await decodeAuthSession('')).toBeNull();
  });

  it('returns null for a malformed token (wrong part count)', async () => {
    expect(await decodeAuthSession('only.two')).toBeNull();
    expect(await decodeAuthSession('one')).toBeNull();
  });

  it('returns null for a token with tampered ciphertext', async () => {
    const token = await encodeAuthSession(SAMPLE_SESSION);
    expect(token).not.toBeNull();
    const parts = token!.split('.');
    // Corrupt the encrypted payload part
    parts[2] = parts[2].split('').reverse().join('');
    const tampered = parts.join('.');
    expect(await decodeAuthSession(tampered)).toBeNull();
  });
});

describe('encodeAuthSession without secret', () => {
  beforeEach(() => setEnv(undefined));

  it('returns null when GITHUB_CLIENT_SECRET is not set', async () => {
    const token = await encodeAuthSession(SAMPLE_SESSION);
    expect(token).toBeNull();
  });
});

describe('decodeAuthSession without secret', () => {
  it('returns null when GITHUB_CLIENT_SECRET is not set', async () => {
    setEnv(undefined);
    expect(await decodeAuthSession('some.token.value')).toBeNull();
  });
});
