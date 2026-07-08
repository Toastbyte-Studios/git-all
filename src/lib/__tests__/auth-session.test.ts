import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  SESSION_VERSION,
  STATE_MAX_AGE_SECONDS,
  createOAuthState,
  decodeAuthSession,
  decodeProviderToken,
  encodeAuthSession,
  encodeProviderToken,
  getProviderTokenCookieName,
  getStateCookieName,
  mergeConnectionIntoSession,
  removeConnectionFromSession,
  type AuthSession,
} from '../auth-session';
import { hasOAuthConfig } from '../oauth-providers';

const TEST_SESSION_SECRET = 'test-session-secret-value-for-unit-tests-only';

const ORIGINAL_ENV = {
  SESSION_SECRET: process.env.SESSION_SECRET,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  GITLAB_CLIENT_ID: process.env.GITLAB_CLIENT_ID,
  GITLAB_CLIENT_SECRET: process.env.GITLAB_CLIENT_SECRET,
  BITBUCKET_CLIENT_KEY: process.env.BITBUCKET_CLIENT_KEY,
  BITBUCKET_CLIENT_SECRET: process.env.BITBUCKET_CLIENT_SECRET,
};

const SAMPLE_SESSION: AuthSession = {
  primary: 'github',
  connections: {
    github: {
      provider: 'github',
      accountId: '123',
      username: 'testuser',
      avatarUrl: 'https://avatars.githubusercontent.com/u/123',
      verifiedAt: 1_717_777_777_000,
    },
  },
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function createSessionTokenForPayload(payload: unknown) {
  const secret = new TextEncoder().encode(TEST_SESSION_SECRET);
  const secretHash = await crypto.subtle.digest('SHA-256', secret);
  const key = await crypto.subtle.importKey(
    'raw',
    secretHash,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
  );

  const tagLength = 16;
  const ciphertext = encrypted.slice(0, encrypted.length - tagLength);
  const tag = encrypted.slice(encrypted.length - tagLength);

  const toBase64Url = (value: Uint8Array) =>
    Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

  return `${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(ciphertext)}`;
}

beforeEach(() => {
  process.env.SESSION_SECRET = TEST_SESSION_SECRET;
});

afterEach(() => {
  restoreEnv();
});

describe('constants', () => {
  it('uses the unified session cookie name', () => {
    expect(SESSION_COOKIE_NAME).toBe('gitall_session');
  });

  it('uses per-provider state cookie names', () => {
    expect(getStateCookieName('github')).toBe('gitall_oauth_state_github');
    expect(getStateCookieName('gitlab')).toBe('gitall_oauth_state_gitlab');
    expect(getStateCookieName('bitbucket')).toBe(
      'gitall_oauth_state_bitbucket',
    );
  });

  it('uses per-provider token cookie names', () => {
    expect(getProviderTokenCookieName('github')).toBe('gitall_token_github');
    expect(getProviderTokenCookieName('gitlab')).toBe('gitall_token_gitlab');
    expect(getProviderTokenCookieName('bitbucket')).toBe(
      'gitall_token_bitbucket',
    );
  });

  it('keeps the existing session lifetime', () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 7);
  });

  it('keeps the existing state lifetime', () => {
    expect(STATE_MAX_AGE_SECONDS).toBe(60 * 10);
  });
});

describe('hasOAuthConfig', () => {
  it('returns true when GitHub OAuth env vars are set', () => {
    process.env.GITHUB_CLIENT_ID = 'github-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'github-client-secret';

    expect(hasOAuthConfig('github')).toBe(true);
  });

  it('returns false when GitLab OAuth is partially configured', () => {
    process.env.GITLAB_CLIENT_ID = 'gitlab-client-id';
    delete process.env.GITLAB_CLIENT_SECRET;

    expect(hasOAuthConfig('gitlab')).toBe(false);
  });

  it('returns false when SESSION_SECRET is missing', () => {
    process.env.GITHUB_CLIENT_ID = 'github-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'github-client-secret';
    delete process.env.SESSION_SECRET;

    expect(hasOAuthConfig('github')).toBe(false);
  });

  it('uses Bitbucket client key env names', () => {
    process.env.BITBUCKET_CLIENT_KEY = 'bitbucket-client-key';
    process.env.BITBUCKET_CLIENT_SECRET = 'bitbucket-client-secret';

    expect(hasOAuthConfig('bitbucket')).toBe(true);
  });
});

describe('createOAuthState', () => {
  it('returns a non-empty base64url string', () => {
    const state = createOAuthState();

    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(state.length).toBeGreaterThanOrEqual(20);
  });

  it('returns different values on each call', () => {
    expect(createOAuthState()).not.toBe(createOAuthState());
  });
});

describe('encodeAuthSession / decodeAuthSession', () => {
  it('round-trips a multi-connection session (accessToken stripped from cookie)', async () => {
    const token = await encodeAuthSession({
      primary: 'gitlab',
      connections: {
        ...SAMPLE_SESSION.connections,
        gitlab: {
          provider: 'gitlab',
          accountId: '456',
          username: 'gitlab-user',
          avatarUrl: 'https://gitlab.com/avatar.png',
          accessToken: 'glpat-token',
          verifiedAt: 1_717_777_888_000,
        },
      },
    });

    expect(token).not.toBeNull();
    // accessToken is intentionally stripped from the session cookie to reduce size.
    await expect(decodeAuthSession(token!)).resolves.toEqual({
      primary: 'gitlab',
      connections: {
        github: {
          provider: 'github',
          accountId: '123',
          username: 'testuser',
          avatarUrl: 'https://avatars.githubusercontent.com/u/123',
          verifiedAt: 1_717_777_777_000,
        },
        gitlab: {
          provider: 'gitlab',
          accountId: '456',
          username: 'gitlab-user',
          avatarUrl: 'https://gitlab.com/avatar.png',
          verifiedAt: 1_717_777_888_000,
        },
      },
    });
  });

  it('returns different encrypted values on each encode', async () => {
    const first = await encodeAuthSession(SAMPLE_SESSION);
    const second = await encodeAuthSession(SAMPLE_SESSION);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
  });

  it('returns null for tampered cookies', async () => {
    const token = await encodeAuthSession(SAMPLE_SESSION);
    expect(token).not.toBeNull();

    const parts = token!.split('.');
    parts[2] = `${parts[2]}tampered`;

    await expect(decodeAuthSession(parts.join('.'))).resolves.toBeNull();
  });

  it('returns null for expired cookies', async () => {
    const token = await createSessionTokenForPayload({
      version: SESSION_VERSION,
      primary: 'github',
      connections: SAMPLE_SESSION.connections,
      expiresAt: Date.now() - 1,
    });

    await expect(decodeAuthSession(token)).resolves.toBeNull();
  });

  it('rejects older session versions', async () => {
    const token = await createSessionTokenForPayload({
      version: SESSION_VERSION - 1,
      primary: 'github',
      connections: SAMPLE_SESSION.connections,
      expiresAt: Date.now() + 60_000,
    });

    await expect(decodeAuthSession(token)).resolves.toBeNull();
  });

  it('returns null when SESSION_SECRET is missing during encode', async () => {
    delete process.env.SESSION_SECRET;

    await expect(encodeAuthSession(SAMPLE_SESSION)).resolves.toBeNull();
  });

  it('returns null when SESSION_SECRET is missing during decode', async () => {
    const token = await encodeAuthSession(SAMPLE_SESSION);
    delete process.env.SESSION_SECRET;

    await expect(decodeAuthSession(token ?? undefined)).resolves.toBeNull();
  });
});

describe('encodeProviderToken / decodeProviderToken', () => {
  it('round-trips a provider token', async () => {
    const encoded = await encodeProviderToken('gho_testtoken123');
    expect(encoded).not.toBeNull();
    await expect(decodeProviderToken(encoded!)).resolves.toBe(
      'gho_testtoken123',
    );
  });

  it('returns different encrypted values on each encode', async () => {
    const first = await encodeProviderToken('some-token');
    const second = await encodeProviderToken('some-token');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
  });

  it('returns null for tampered token cookies', async () => {
    const encoded = await encodeProviderToken('token-value');
    expect(encoded).not.toBeNull();
    const parts = encoded!.split('.');
    parts[2] = `${parts[2]}tampered`;
    await expect(decodeProviderToken(parts.join('.'))).resolves.toBeNull();
  });

  it('returns null for undefined input', async () => {
    await expect(decodeProviderToken(undefined)).resolves.toBeNull();
  });

  it('returns null when SESSION_SECRET is missing during encode', async () => {
    delete process.env.SESSION_SECRET;
    await expect(encodeProviderToken('token-value')).resolves.toBeNull();
  });

  it('returns null when SESSION_SECRET is missing during decode', async () => {
    const encoded = await encodeProviderToken('token-value');
    delete process.env.SESSION_SECRET;
    await expect(decodeProviderToken(encoded!)).resolves.toBeNull();
  });
});

describe('session connection helpers', () => {
  it('adding a second connection preserves the first one', () => {
    const merged = mergeConnectionIntoSession(SAMPLE_SESSION, {
      provider: 'bitbucket',
      accountId: 'workspace:789',
      username: 'bb-user',
      avatarUrl: 'https://bitbucket.org/avatar.png',
      verifiedAt: 1_717_777_999_000,
    });

    expect(merged.connections.github).toEqual(
      SAMPLE_SESSION.connections.github,
    );
    expect(merged.connections.bitbucket?.username).toBe('bb-user');
    expect(merged.primary).toBe('bitbucket');
  });

  it('removing a connection leaves remaining ones intact', () => {
    const nextSession = removeConnectionFromSession(
      {
        primary: 'github',
        connections: {
          ...SAMPLE_SESSION.connections,
          gitlab: {
            provider: 'gitlab',
            accountId: '456',
            username: 'gitlab-user',
            avatarUrl: 'https://gitlab.com/avatar.png',
            verifiedAt: 1_717_777_888_000,
          },
        },
      },
      'github',
    );

    expect(nextSession).not.toBeNull();
    expect(nextSession).toEqual({
      primary: 'gitlab',
      connections: {
        gitlab: {
          provider: 'gitlab',
          accountId: '456',
          username: 'gitlab-user',
          avatarUrl: 'https://gitlab.com/avatar.png',
          verifiedAt: 1_717_777_888_000,
        },
      },
    });
  });

  it('removing the last connection clears the session', () => {
    expect(removeConnectionFromSession(SAMPLE_SESSION, 'github')).toBeNull();
  });
});
