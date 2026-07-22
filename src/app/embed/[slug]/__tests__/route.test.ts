import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContributionData } from '@/lib/types';
import { GET } from '../route';

function createRequest(url: string) {
  return new NextRequest(url);
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function makeContributionResponse(data: Partial<ContributionData> = {}) {
  const defaults: ContributionData = {
    platform: 'github',
    username: 'octocat',
    totalContributions: 10,
    dateRange: { from: '2025-01-01', to: '2025-01-07' },
    calendar: [
      { date: '2025-01-01', count: 2, level: 1 },
      { date: '2025-01-02', count: 3, level: 2 },
    ],
  };
  return new Response(JSON.stringify({ ...defaults, ...data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('embed route GET', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns 400 SVG for a missing username slug', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    // An empty slug after stripping .svg → missing username
    const response = await GET(
      createRequest('https://gitall.app/embed/.svg'),
      makeParams('.svg'),
    );

    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).toMatch(/^<svg /);
    expect(body).toContain('Missing username');
  });

  it('returns a valid SVG for a simple GitHub-only embed', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeContributionResponse());
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest('https://gitall.app/embed/octocat.svg'),
      makeParams('octocat.svg'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=86400');

    const body = await response.text();
    expect(body).toMatch(/^<svg /);
    expect(body).toMatch(/<\/svg>$/);
  });

  it('uses path username as GitHub username when no explicit params given', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeContributionResponse({ username: 'octocat' }));
    vi.stubGlobal('fetch', fetchMock);

    await GET(
      createRequest('https://gitall.app/embed/octocat'),
      makeParams('octocat'),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/api/github');
    expect(calledUrl).toContain('username=octocat');
  });

  it('explicit ?github param takes precedence over path slug', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeContributionResponse({ username: 'torvalds' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await GET(
      createRequest('https://gitall.app/embed/myslug?github=torvalds'),
      makeParams('myslug'),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/api/github');
    expect(calledUrl).toContain('username=torvalds');
  });

  it('does not fetch GitHub when only non-GitHub explicit params are present', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeContributionResponse({ platform: 'gitlab', username: 'jdoe' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await GET(
      createRequest('https://gitall.app/embed/myslug?gitlab=jdoe'),
      makeParams('myslug'),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/api/gitlab');
    expect(calledUrl).not.toContain('/api/github');
  });

  it('fetches all requested platforms in parallel', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeContributionResponse({ platform: 'github' }))
      .mockResolvedValueOnce(
        makeContributionResponse({ platform: 'gitlab', username: 'jdoe' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest(
        'https://gitall.app/embed/myslug?github=octocat&gitlab=jdoe',
      ),
      makeParams('myslug'),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    const calledUrls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(calledUrls.some((u) => u.includes('/api/github'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('/api/gitlab'))).toBe(true);
  });

  it('merges contributions from multiple platforms', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeContributionResponse({
          platform: 'github',
          username: 'octocat',
          totalContributions: 5,
          calendar: [{ date: '2025-01-01', count: 5, level: 3 }],
        }),
      )
      .mockResolvedValueOnce(
        makeContributionResponse({
          platform: 'gitlab',
          username: 'jdoe',
          totalContributions: 3,
          calendar: [{ date: '2025-01-01', count: 3, level: 2 }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest(
        'https://gitall.app/embed/myslug?github=octocat&gitlab=jdoe',
      ),
      makeParams('myslug'),
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    // Merged total = 5+3 = 8
    expect(body).toContain('8');
  });

  it('degrades gracefully when a platform fetch times out (partial heatmap)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeContributionResponse({ platform: 'github' }))
      .mockRejectedValueOnce(new DOMException('Timeout', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest(
        'https://gitall.app/embed/myslug?github=octocat&gitlab=jdoe',
      ),
      makeParams('myslug'),
    );

    // Should still return 200 with the successful platform's data
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toMatch(/^<svg /);
  });

  it('returns 404 SVG when all platforms fail', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest('https://gitall.app/embed/octocat.svg'),
      makeParams('octocat.svg'),
    );

    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toMatch(/^<svg /);
    expect(body).toContain('No contribution data found');
  });

  it('error SVG responses include X-Robots-Tag: noindex', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest('https://gitall.app/embed/.svg'),
      makeParams('.svg'),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('treats empty ?github= param as absent and falls back to path username', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeContributionResponse({ username: 'octocat' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest('https://gitall.app/embed/octocat.svg?github='),
      makeParams('octocat.svg'),
    );

    // Should still succeed using path username as GitHub username
    expect(response.status).toBe(200);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/api/github');
    expect(calledUrl).toContain('username=octocat');
  });

  it('treats whitespace-only ?github= param as absent', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeContributionResponse({ username: 'octocat' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest('https://gitall.app/embed/octocat.svg?github=   '),
      makeParams('octocat.svg'),
    );

    expect(response.status).toBe(200);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/api/github');
    expect(calledUrl).toContain('username=octocat');
  });

  it('applies the dark theme by default', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeContributionResponse());
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest('https://gitall.app/embed/octocat.svg'),
      makeParams('octocat.svg'),
    );

    const body = await response.text();
    // Dark background color
    expect(body).toContain('#161b22');
  });

  it('applies the light theme when ?theme=light is set', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeContributionResponse());
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest('https://gitall.app/embed/octocat.svg?theme=light'),
      makeParams('octocat.svg'),
    );

    const body = await response.text();
    // Light background color
    expect(body).toContain('#f6f8fa');
    expect(body).not.toContain('#161b22');
  });

  it('sends x-gitall-internal header on internal loopback fetches', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeContributionResponse());
    vi.stubGlobal('fetch', fetchMock);

    await GET(
      createRequest('https://gitall.app/embed/octocat.svg'),
      makeParams('octocat.svg'),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1];
    const sentHeaders = requestInit?.headers as
      | Record<string, string>
      | undefined;
    expect(sentHeaders?.['x-gitall-internal']).toBe('embed');
  });
});
