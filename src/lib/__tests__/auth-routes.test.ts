import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as bitbucketAuthGet } from '@/app/api/auth/bitbucket/route';
import { GET as callbackGet } from '@/app/api/auth/callback/[provider]/route';
import { DELETE as deleteConnection } from '@/app/api/auth/connections/[provider]/route';
import { GET as githubAuthGet } from '@/app/api/auth/github/route';
import { GET as gitlabAuthGet } from '@/app/api/auth/gitlab/route';
import {
  SESSION_COOKIE_NAME,
  decodeAuthSession,
  decodeProviderToken,
  encodeAuthSession,
  getProviderTokenCookieName,
  getStateCookieName,
  type AuthSession,
} from '../auth-session';
import { OAUTH_PROVIDERS } from '../oauth-providers';

const ORIGINAL_ENV = {
  SESSION_SECRET: process.env.SESSION_SECRET,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  GITLAB_CLIENT_ID: process.env.GITLAB_CLIENT_ID,
  GITLAB_CLIENT_SECRET: process.env.GITLAB_CLIENT_SECRET,
  BITBUCKET_CLIENT_KEY: process.env.BITBUCKET_CLIENT_KEY,
  BITBUCKET_CLIENT_SECRET: process.env.BITBUCKET_CLIENT_SECRET,
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

function createRequest(url: string, cookies: Record<string, string> = {}) {
  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return new NextRequest(url, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-value-for-route-tests';
  process.env.GITHUB_CLIENT_ID = 'github-client-id';
  process.env.GITHUB_CLIENT_SECRET = 'github-client-secret';
  process.env.GITLAB_CLIENT_ID = 'gitlab-client-id';
  process.env.GITLAB_CLIENT_SECRET = 'gitlab-client-secret';
  process.env.BITBUCKET_CLIENT_KEY = 'bitbucket-client-key';
  process.env.BITBUCKET_CLIENT_SECRET = 'bitbucket-client-secret';
});

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
});

describe('OAuth callback route', () => {
  it('merges a new provider connection into the existing session', async () => {
    const existingSession: AuthSession = {
      primary: 'github',
      connections: {
        github: {
          provider: 'github',
          accountId: '123',
          username: 'octocat',
          avatarUrl: 'https://avatars.githubusercontent.com/u/123',
          verifiedAt: 1_717_777_777_000,
        },
      },
    };

    const existingCookie = await encodeAuthSession(existingSession);
    expect(existingCookie).not.toBeNull();

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'glpat-new-token' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 456,
          username: 'gitlab-user',
          avatar_url: 'https://gitlab.com/avatar.png',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await callbackGet(
      createRequest(
        'https://gitall.app/api/auth/callback/gitlab?code=abc&state=state-123',
        {
          [SESSION_COOKIE_NAME]: existingCookie!,
          [getStateCookieName('gitlab')]: 'state-123',
        },
      ),
      { params: Promise.resolve({ provider: 'gitlab' }) },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://gitall.app/');

    const nextCookie = response.cookies.get(SESSION_COOKIE_NAME)?.value;
    expect(nextCookie).toBeTruthy();

    // Session cookie should NOT contain access tokens (to stay under 4096 bytes).
    const decodedSession = await decodeAuthSession(nextCookie);
    expect(decodedSession).toEqual({
      primary: 'gitlab',
      connections: {
        github: existingSession.connections.github,
        gitlab: {
          provider: 'gitlab',
          accountId: '456',
          username: 'gitlab-user',
          avatarUrl: 'https://gitlab.com/avatar.png',
          verifiedAt: expect.any(Number),
        },
      },
    });

    // Token should be stored in a separate per-provider cookie.
    const gitlabTokenCookie = response.cookies.get(
      getProviderTokenCookieName('gitlab'),
    )?.value;
    expect(gitlabTokenCookie).toBeTruthy();
    await expect(decodeProviderToken(gitlabTokenCookie)).resolves.toBe(
      'glpat-new-token',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://gitlab.com/oauth/token');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://gitlab.com/api/v4/user');
  });

  it('stores the Bitbucket workspace slug, not the nickname or deprecated username', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'bbtoken', token_type: 'bearer' }),
      )
      // /2.0/user — nickname may be a display name, not the workspace slug
      .mockResolvedValueOnce(
        jsonResponse({
          account_id: '{bb-account-uuid}',
          nickname: 'Sample Display Name',
          links: { avatar: { href: 'https://bitbucket.org/avatar.png' } },
        }),
      )
      // /2.0/user/permissions/workspaces?role=owner — the authoritative slug
      .mockResolvedValueOnce(
        jsonResponse({
          values: [{ workspace: { slug: 'sample-workspace' } }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await callbackGet(
      createRequest(
        'https://gitall.app/api/auth/callback/bitbucket?code=abc&state=state-bb',
        {
          [getStateCookieName('bitbucket')]: 'state-bb',
        },
      ),
      { params: Promise.resolve({ provider: 'bitbucket' }) },
    );

    expect(response.status).toBe(307);

    const nextCookie = response.cookies.get(SESSION_COOKIE_NAME)?.value;
    const decodedSession = await decodeAuthSession(nextCookie);
    expect(decodedSession?.connections.bitbucket?.username).toBe(
      'sample-workspace',
    );
    // Verify all three calls were made
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.bitbucket.org/2.0/user',
    );
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      '/user/permissions/workspaces',
    );
  });

  it('prefers the non-admin Bitbucket username when the workspace slug only adds the admin suffix', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'bbtoken', token_type: 'bearer' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          account_id: '{bb-account-uuid}',
          nickname: 'Sample Display Name',
          username: 'sample-user',
          links: { avatar: { href: 'https://bitbucket.org/avatar.png' } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          values: [{ workspace: { slug: 'sample-user-admin' } }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await callbackGet(
      createRequest(
        'https://gitall.app/api/auth/callback/bitbucket?code=abc&state=state-bb',
        {
          [getStateCookieName('bitbucket')]: 'state-bb',
        },
      ),
      { params: Promise.resolve({ provider: 'bitbucket' }) },
    );

    expect(response.status).toBe(307);

    const nextCookie = response.cookies.get(SESSION_COOKIE_NAME)?.value;
    const decodedSession = await decodeAuthSession(nextCookie);
    expect(decodedSession?.connections.bitbucket?.username).toBe('sample-user');
  });

  it('strips -admin suffix when both deprecated username and workspace slug have it', async () => {
    // Regression test: Bitbucket's deprecated username AND workspace slug both end in
    // "-admin" (e.g. "jason-shprintz-admin"). The old check only normalised when
    // slug === legacyUsername + "-admin", so it missed this case. The stored
    // identifier should be the base slug ("jason-shprintz"), not the admin variant.
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'bbtoken', token_type: 'bearer' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          account_id: '{bb-account-uuid}',
          nickname: 'Jason Shprintz',
          username: 'jason-shprintz-admin',
          links: { avatar: { href: 'https://bitbucket.org/avatar.png' } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          values: [{ workspace: { slug: 'jason-shprintz-admin' } }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await callbackGet(
      createRequest(
        'https://gitall.app/api/auth/callback/bitbucket?code=abc&state=state-bb',
        {
          [getStateCookieName('bitbucket')]: 'state-bb',
        },
      ),
      { params: Promise.resolve({ provider: 'bitbucket' }) },
    );

    expect(response.status).toBe(307);

    const nextCookie = response.cookies.get(SESSION_COOKIE_NAME)?.value;
    const decodedSession = await decodeAuthSession(nextCookie);
    expect(decodedSession?.connections.bitbucket?.username).toBe(
      'jason-shprintz',
    );
    // Verify all three calls were made and the third was the workspaces request
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      '/user/permissions/workspaces',
    );
  });

  it('strips -admin suffix from deprecated username fallback when workspaces API fails', async () => {
    // Regression test: the workspaces API fails and the only available identifier
    // is the deprecated username field, which carries the synthetic "-admin" suffix.
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'bbtoken', token_type: 'bearer' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          account_id: '{bb-account-uuid}',
          nickname: 'Jason Shprintz',
          username: 'jason-shprintz-admin',
          links: { avatar: { href: 'https://bitbucket.org/avatar.png' } },
        }),
      )
      .mockResolvedValueOnce(new Response('', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await callbackGet(
      createRequest(
        'https://gitall.app/api/auth/callback/bitbucket?code=abc&state=state-bb',
        {
          [getStateCookieName('bitbucket')]: 'state-bb',
        },
      ),
      { params: Promise.resolve({ provider: 'bitbucket' }) },
    );

    expect(response.status).toBe(307);

    const nextCookie = response.cookies.get(SESSION_COOKIE_NAME)?.value;
    const decodedSession = await decodeAuthSession(nextCookie);
    expect(decodedSession?.connections.bitbucket?.username).toBe(
      'jason-shprintz',
    );
    // Verify all three calls were made and the third was the workspaces request
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      '/user/permissions/workspaces',
    );
  });

  it('falls back to Bitbucket username when workspaces API fails', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'bbtoken', token_type: 'bearer' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          account_id: '{bb-account-uuid}',
          nickname: 'Sample Display Name',
          username: 'sample-workspace',
          links: { avatar: { href: 'https://bitbucket.org/avatar.png' } },
        }),
      )
      // workspaces API returns an error
      .mockResolvedValueOnce(new Response('', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await callbackGet(
      createRequest(
        'https://gitall.app/api/auth/callback/bitbucket?code=abc&state=state-bb',
        {
          [getStateCookieName('bitbucket')]: 'state-bb',
        },
      ),
      { params: Promise.resolve({ provider: 'bitbucket' }) },
    );

    expect(response.status).toBe(307);

    const nextCookie = response.cookies.get(SESSION_COOKIE_NAME)?.value;
    const decodedSession = await decodeAuthSession(nextCookie);
    expect(decodedSession?.connections.bitbucket?.username).toBe(
      'sample-workspace',
    );
  });

  it('falls back to Bitbucket username when the workspaces request throws', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'bbtoken', token_type: 'bearer' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          account_id: '{bb-account-uuid}',
          nickname: 'Sample Display Name',
          username: 'sample-workspace',
          links: { avatar: { href: 'https://bitbucket.org/avatar.png' } },
        }),
      )
      .mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await callbackGet(
      createRequest(
        'https://gitall.app/api/auth/callback/bitbucket?code=abc&state=state-bb',
        {
          [getStateCookieName('bitbucket')]: 'state-bb',
        },
      ),
      { params: Promise.resolve({ provider: 'bitbucket' }) },
    );

    expect(response.status).toBe(307);

    const nextCookie = response.cookies.get(SESSION_COOKIE_NAME)?.value;
    const decodedSession = await decodeAuthSession(nextCookie);
    expect(decodedSession?.connections.bitbucket?.username).toBe(
      'sample-workspace',
    );
  });
});

describe('OAuth init routes', () => {
  it.each([
    {
      provider: 'github',
      routeGet: githubAuthGet,
      clientIdValue: 'github-client-id',
    },
    {
      provider: 'gitlab',
      routeGet: gitlabAuthGet,
      clientIdValue: 'gitlab-client-id',
    },
    {
      provider: 'bitbucket',
      routeGet: bitbucketAuthGet,
      clientIdValue: 'bitbucket-client-key',
    },
  ] as const)(
    'builds the $provider authorize URL from shared provider config',
    async ({ provider, routeGet, clientIdValue }) => {
      const response = await routeGet(
        createRequest(`https://gitall.app/api/auth/${provider}`),
      );

      expect(response.status).toBe(307);

      const location = response.headers.get('location');
      expect(location).toBeTruthy();

      const redirectUrl = new URL(location!);
      const config = OAUTH_PROVIDERS[provider];
      expect(redirectUrl.origin + redirectUrl.pathname).toBe(
        config.authorizeUrl,
      );
      expect(redirectUrl.searchParams.get('client_id')).toBe(clientIdValue);
      expect(redirectUrl.searchParams.get('scope')).toBe(config.scope);
      expect(redirectUrl.searchParams.get('response_type')).toBe('code');
      expect(redirectUrl.searchParams.get('redirect_uri')).toBe(
        `https://gitall.app/api/auth/callback/${provider}`,
      );
      expect(redirectUrl.searchParams.get('state')).toBeTruthy();
    },
  );

  it('treats OAuth as unavailable when SESSION_SECRET is missing', async () => {
    delete process.env.SESSION_SECRET;

    const response = await githubAuthGet(
      createRequest('https://gitall.app/api/auth/github'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://gitall.app/?auth_error=oauth_not_configured',
    );
  });
});

describe('disconnect route', () => {
  it('removes one connection and keeps the remaining session', async () => {
    const existingSession: AuthSession = {
      primary: 'github',
      connections: {
        github: {
          provider: 'github',
          accountId: '123',
          username: 'octocat',
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
    };

    const existingCookie = await encodeAuthSession(existingSession);
    expect(existingCookie).not.toBeNull();

    const response = await deleteConnection(
      createRequest('https://gitall.app/api/auth/connections/github', {
        [SESSION_COOKIE_NAME]: existingCookie!,
      }),
      { params: Promise.resolve({ provider: 'github' }) },
    );

    expect(response.status).toBe(200);

    const nextCookie = response.cookies.get(SESSION_COOKIE_NAME)?.value;
    const decodedSession = await decodeAuthSession(nextCookie);
    expect(decodedSession).toEqual({
      primary: 'gitlab',
      connections: {
        gitlab: existingSession.connections.gitlab,
      },
    });

    // Token cookie for the removed provider should be cleared.
    const githubTokenCookie = response.cookies.get(
      getProviderTokenCookieName('github'),
    );
    expect(githubTokenCookie?.value).toBe('');
  });

  it('clears the cookie when removing the last connection', async () => {
    const existingCookie = await encodeAuthSession({
      primary: 'github',
      connections: {
        github: {
          provider: 'github',
          accountId: '123',
          username: 'octocat',
          avatarUrl: 'https://avatars.githubusercontent.com/u/123',
          verifiedAt: 1_717_777_777_000,
        },
      },
    });
    expect(existingCookie).not.toBeNull();

    const response = await deleteConnection(
      createRequest('https://gitall.app/api/auth/connections/github', {
        [SESSION_COOKIE_NAME]: existingCookie!,
      }),
      { params: Promise.resolve({ provider: 'github' }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain(
      `${SESSION_COOKIE_NAME}=;`,
    );
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
