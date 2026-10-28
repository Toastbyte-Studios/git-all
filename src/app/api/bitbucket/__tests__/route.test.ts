import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Bitbucket contribution route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to the non-admin slug when the admin slug is not found', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            {
              slug: 'sample-repo',
              owner: {
                account_id: '{bb-account-uuid}',
                nickname: 'sample-user',
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ values: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest(
        'https://gitall.app/api/bitbucket?username=sample-user-admin&from=2025-01-01&to=2025-01-02',
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      platform: 'bitbucket',
      username: 'sample-user',
      totalContributions: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.bitbucket.org/2.0/repositories/sample-user-admin?pagelen=100',
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.bitbucket.org/2.0/repositories/sample-user?pagelen=100',
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'https://api.bitbucket.org/2.0/repositories/sample-user/sample-repo/commits?pagelen=100',
    );
  });

  it('matches commits using the resolved workspace when owner nickname is unavailable', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            {
              slug: 'workspace-repo',
              owner: {
                account_id: undefined,
                nickname: undefined,
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            {
              date: '2025-02-01T12:00:00Z',
              author: {
                user: {
                  username: 'resolved-workspace',
                },
              },
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest(
        'https://gitall.app/api/bitbucket?username=resolved-workspace-admin&from=2025-02-01&to=2025-02-01',
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      username: 'resolved-workspace',
      totalContributions: 1,
    });
  });

  it('reuses cache across admin fallback and normalized workspace requests', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            { slug: 'cache-repo', owner: { nickname: 'cache-workspace' } },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ values: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const firstResponse = await GET(
      new NextRequest(
        'https://gitall.app/api/bitbucket?username=cache-workspace-admin&from=2025-03-01&to=2025-03-01',
      ),
    );
    expect(firstResponse.status).toBe(200);

    const secondResponse = await GET(
      new NextRequest(
        'https://gitall.app/api/bitbucket?username=cache-workspace&from=2025-03-01&to=2025-03-01',
      ),
    );
    expect(secondResponse.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  describe('agent attribution', () => {
    const owner = { account_id: '{agent-owner}', nickname: 'agent-owner' };
    const ownCommit = (date: string, message: string) => ({
      date,
      message,
      author: {
        raw: 'Agent Owner <owner@example.com>',
        user: { account_id: '{agent-owner}' },
      },
    });

    async function lookup(commits: unknown[], range: string) {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          jsonResponse({ values: [{ slug: 'agent-repo', owner }] }),
        )
        .mockResolvedValueOnce(jsonResponse({ values: commits }));
      vi.stubGlobal('fetch', fetchMock);

      const response = await GET(
        new NextRequest(
          `https://gitall.app/api/bitbucket?username=agent-owner&${range}`,
        ),
      );
      expect(response.status).toBe(200);
      return response.json();
    }

    it('counts agent-attributed owner commits per day and per agent', async () => {
      const body = await lookup(
        [
          ownCommit(
            '2025-05-02T15:00:00Z',
            'feat: both\n\nCo-Authored-By: Claude Opus 4 <noreply@anthropic.com>\nCo-authored-by: Cursor <cursoragent@cursor.com>',
          ),
          ownCommit('2025-05-02T12:00:00Z', 'fix: by hand'),
          ownCommit(
            '2025-05-01T18:00:00Z',
            'feat: claude\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
          ),
          // Another account's agent commit must not count for the owner.
          {
            date: '2025-05-01T10:00:00Z',
            message: 'x\n\nCo-authored-by: Codex <noreply@openai.com>',
            author: {
              raw: 'Someone <someone@example.com>',
              user: { account_id: '{someone-else}' },
            },
          },
        ],
        'from=2025-05-01&to=2025-05-02',
      );

      expect(body).toMatchObject({
        totalContributions: 3,
        agentContributions: 2,
        agentBreakdown: { claude: 2, cursor: 1 },
        calendar: [
          { date: '2025-05-01', count: 1, agentCount: 1 },
          { date: '2025-05-02', count: 2, agentCount: 1 },
        ],
      });
      expect(body.agentBreakdown).not.toHaveProperty('codex');
    });

    it('reports zero rather than omitting the fields when nothing is attributed', async () => {
      const body = await lookup(
        [ownCommit('2025-06-01T09:00:00Z', 'chore: bump deps')],
        'from=2025-06-01&to=2025-06-01',
      );

      expect(body).toMatchObject({
        totalContributions: 1,
        agentContributions: 0,
        agentBreakdown: {},
        calendar: [{ date: '2025-06-01', count: 1, agentCount: 0 }],
      });
    });
  });

  it('returns a workspace-specific not found error message', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest(
        'https://gitall.app/api/bitbucket?username=missing-workspace&from=2025-04-01&to=2025-04-01',
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Bitbucket workspace 'missing-workspace' not found.",
    });
  });
});
