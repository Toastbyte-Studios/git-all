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
