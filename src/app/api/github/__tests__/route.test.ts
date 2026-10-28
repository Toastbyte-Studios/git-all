import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as analyticsServer from '@/lib/analytics-server';
import {
  SESSION_COOKIE_NAME,
  encodeAuthSession,
  encodeProviderToken,
  getProviderTokenCookieName,
  type AuthSession,
} from '@/lib/auth-session';
import {
  DEFAULT_CONTRIBUTION_PERIOD,
  getContributionDateRange,
} from '@/lib/contribution-period';
import { GET } from '../route';

const profiles = vi.hoisted(() => ({
  saveAgentSummary: vi.fn(async () => true),
}));
vi.mock('@/lib/profiles', () => profiles);

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

  it('skips lookup_success analytics when x-gitall-internal header is present', async () => {
    const trackSpy = vi
      .spyOn(analyticsServer, 'trackServerEvent')
      .mockReturnValue(undefined);

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(githubContributionResponse('octocat', 3));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest(
        'https://gitall.app/api/github?username=octointernaltest',
        {
          headers: { 'x-gitall-internal': 'embed' },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it('fires lookup_success analytics for normal (non-internal) requests', async () => {
    const trackSpy = vi
      .spyOn(analyticsServer, 'trackServerEvent')
      .mockReturnValue(undefined);

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(githubContributionResponse('octocat', 3));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest('https://gitall.app/api/github?username=octonormaltest'),
    );

    expect(response.status).toBe(200);
    expect(trackSpy).toHaveBeenCalledWith(
      expect.anything(),
      'lookup_success',
      expect.objectContaining({ provider: 'github' }),
    );
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

  describe('agent attribution', () => {
    async function signedInCookies(login: string, userId?: string) {
      const session: AuthSession = {
        primary: 'github',
        ...(userId && { userId }),
        connections: {
          github: {
            provider: 'github',
            accountId: '123',
            username: login,
            avatarUrl: 'https://avatars.githubusercontent.com/u/123',
            verifiedAt: 1_717_777_777_000,
          },
        },
      };
      return {
        [SESSION_COOKIE_NAME]: (await encodeAuthSession(session))!,
        [getProviderTokenCookieName('github')]:
          (await encodeProviderToken('user-token'))!,
      };
    }

    /**
     * Calendar of 2 commits on 2025-01-01, plus 3 agent commits in one public
     * repo's history, dated `commitDay`.
     */
    function stubGithub({
      failAgentLookup = false,
      commitDay = '2025-01-01',
    } = {}) {
      const agentCommit = (agent: string) => ({
        message: `x\n\nCo-authored-by: ${agent}`,
        author: {
          name: 'Mona',
          email: 'mona@example.com',
          date: `${commitDay}T10:00:00+00:00`,
          user: { login: 'monalisa' },
        },
        authors: { nodes: [{ user: { login: 'monalisa' } }] },
      });

      const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
        const { query } = JSON.parse(String(init?.body));
        if (query.includes('contributionCalendar')) {
          return githubContributionResponse('monalisa', 2);
        }
        if (failAgentLookup) {
          return new Response('', { status: 502 });
        }
        if (query.includes('commitContributionsByRepository')) {
          return new Response(
            JSON.stringify({
              data: {
                user: {
                  contributionsCollection: {
                    commitContributionsByRepository: [
                      {
                        repository: {
                          name: 'app',
                          owner: { login: 'monalisa' },
                          visibility: 'PUBLIC',
                        },
                        contributions: {
                          pageInfo: { hasNextPage: false },
                          nodes: [{ commitCount: 3 }],
                        },
                      },
                    ],
                  },
                },
              },
            }),
          );
        }
        return new Response(
          JSON.stringify({
            data: {
              r0: {
                defaultBranchRef: {
                  target: {
                    history: {
                      pageInfo: { hasNextPage: false, endCursor: null },
                      nodes: [
                        agentCommit('Claude <noreply@anthropic.com>'),
                        agentCommit('Cursor <cursoragent@cursor.com>'),
                        agentCommit('Claude <noreply@anthropic.com>'),
                      ],
                    },
                  },
                },
              },
            },
          }),
        );
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('adds agent counts to the signed-in owner lookup, capped at each day count', async () => {
      const fetchMock = stubGithub();

      const response = await GET(
        createRequest(
          'https://gitall.app/api/github?username=monalisa&from=2025-01-01&to=2025-01-01',
          await signedInCookies('monalisa'),
        ),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const body = await response.json();
      expect(body.calendar).toEqual([
        { date: '2025-01-01', count: 2, level: 2, agentCount: 2 },
      ]);
      expect(body.agentContributions).toBe(2);
      expect(body.agentBreakdown).toEqual({ claude: 2, cursor: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('saves the public summary for the default period when signed in with a profile', async () => {
      profiles.saveAgentSummary.mockClear();
      const { from, to } = getContributionDateRange(
        DEFAULT_CONTRIBUTION_PERIOD,
      );
      stubGithub({ commitDay: to });

      const response = await GET(
        createRequest(
          `https://gitall.app/api/github?username=monalisa&from=${from}&to=${to}`,
          await signedInCookies('monalisa', 'USER1'),
        ),
      );

      expect(response.status).toBe(200);
      expect(profiles.saveAgentSummary).toHaveBeenCalledWith(
        'USER1',
        'github',
        {
          agentContributions: 3,
          agentBreakdown: { claude: 2, cursor: 1 },
          from,
          to,
          computedAt: expect.any(Number),
        },
      );
    });

    it('does not save a summary for other periods', async () => {
      profiles.saveAgentSummary.mockClear();
      stubGithub();

      await GET(
        createRequest(
          'https://gitall.app/api/github?username=monalisa&from=2025-01-01&to=2025-01-01',
          await signedInCookies('monalisa', 'USER1'),
        ),
      );

      expect(profiles.saveAgentSummary).not.toHaveBeenCalled();
    });

    it('does not save a summary without a stored profile', async () => {
      profiles.saveAgentSummary.mockClear();
      const { from, to } = getContributionDateRange(
        DEFAULT_CONTRIBUTION_PERIOD,
      );
      stubGithub({ commitDay: to });

      await GET(
        createRequest(
          `https://gitall.app/api/github?username=monalisa&from=${from}&to=${to}`,
          await signedInCookies('monalisa'),
        ),
      );

      expect(profiles.saveAgentSummary).not.toHaveBeenCalled();
    });

    it('still answers when saving the summary fails', async () => {
      profiles.saveAgentSummary.mockClear();
      profiles.saveAgentSummary.mockRejectedValueOnce(new Error('D1 down'));
      const { from, to } = getContributionDateRange(
        DEFAULT_CONTRIBUTION_PERIOD,
      );
      stubGithub({ commitDay: to });

      const response = await GET(
        createRequest(
          `https://gitall.app/api/github?username=monalisa&from=${from}&to=${to}`,
          await signedInCookies('monalisa', 'USER1'),
        ),
      );

      expect(response.status).toBe(200);
      expect(profiles.saveAgentSummary).toHaveBeenCalledTimes(1);
    });

    it('does not read commits when the owner looks up someone else', async () => {
      const fetchMock = stubGithub();

      const response = await GET(
        createRequest(
          'https://gitall.app/api/github?username=octocat&from=2025-01-01&to=2025-01-01',
          await signedInCookies('monalisa'),
        ),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).not.toHaveProperty('agentContributions');
      expect(body.calendar[0]).not.toHaveProperty('agentCount');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not read commits for anonymous lookups', async () => {
      const fetchMock = stubGithub();

      const response = await GET(
        createRequest(
          'https://gitall.app/api/github?username=monalisa&from=2025-01-02&to=2025-01-02',
        ),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).not.toHaveProperty('agentContributions');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('still returns the calendar, without agent fields, when the agent lookup fails', async () => {
      stubGithub({ failAgentLookup: true });

      const response = await GET(
        createRequest(
          'https://gitall.app/api/github?username=monalisa&from=2025-01-03&to=2025-01-03',
          await signedInCookies('monalisa'),
        ),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.totalContributions).toBe(2);
      expect(body).not.toHaveProperty('agentContributions');
    });
  });
});
