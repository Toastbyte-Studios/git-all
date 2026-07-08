import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_COOKIE_NAME,
  encodeAuthSession,
  encodeProviderToken,
  getProviderTokenCookieName,
  type AuthSession,
} from '@/lib/auth-session';
import { GET } from '../route';

const ORIGINAL_ENV = {
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  SESSION_SECRET: process.env.SESSION_SECRET,
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

function githubContributionResponse(login: string, totalContributions: number) {
  return new Response(
    JSON.stringify({
      data: {
        user: {
          login,
          contributionsCollection: {
            contributionCalendar: {
              totalContributions,
              weeks: [
                {
                  contributionDays: [
                    {
                      date: '2025-01-01',
                      contributionCount: totalContributions,
                      color: '#40c463',
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

describe('GitHub contribution route', () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'server-token';
    process.env.SESSION_SECRET = 'test-session-secret-value-for-github-route';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  it('ignores a GitHub token cookie when there is no GitHub connection in the session', async () => {
    const githubTokenCookie = await encodeProviderToken('user-token');
    expect(githubTokenCookie).not.toBeNull();

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(githubContributionResponse('octocat', 3));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest('https://gitall.app/api/github?username=octocat', {
        [getProviderTokenCookieName('github')]: githubTokenCookie!,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Cache')).toBe('MISS');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const firstRequestHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(firstRequestHeaders.Authorization).toContain(
      process.env.GITHUB_TOKEN ?? '',
    );
    expect(firstRequestHeaders.Authorization).not.toContain('user-token');
  });

  it('uses shared caching when falling back to GITHUB_TOKEN for a GitHub session', async () => {
    const existingSession: AuthSession = {
      primary: 'github',
      connections: {
        github: {
          provider: 'github',
          accountId: '123',
          username: 'monalisa',
          avatarUrl: 'https://avatars.githubusercontent.com/u/123',
          verifiedAt: 1_717_777_777_000,
        },
      },
    };
    const sessionCookie = await encodeAuthSession(existingSession);
    expect(sessionCookie).not.toBeNull();

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(githubContributionResponse('monalisa', 5));
    vi.stubGlobal('fetch', fetchMock);

    const requestUrl =
      'https://gitall.app/api/github?username=monalisa&from=2025-02-01&to=2025-02-01';
    const requestCookies = {
      [SESSION_COOKIE_NAME]: sessionCookie!,
    };

    const firstResponse = await GET(createRequest(requestUrl, requestCookies));
    const secondResponse = await GET(createRequest(requestUrl, requestCookies));

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers.get('X-Cache')).toBe('MISS');
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.headers.get('X-Cache')).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const cachedRequestHeaders = fetchMock.mock.calls[0]?.[1]
      ?.headers as Record<string, string>;
    expect(cachedRequestHeaders.Authorization).toContain(
      process.env.GITHUB_TOKEN ?? '',
    );
    expect(cachedRequestHeaders.Authorization).not.toContain('user-token');
  });
});
