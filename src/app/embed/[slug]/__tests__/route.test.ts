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

/** Map-backed stand-in for `caches.default`, keyed by request URL. */
function stubMemoryCache() {
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => {
      store.set(request.url, response);
    }),
  };
  vi.stubGlobal('caches', { default: cache });
  return { cache, store };
}

const LAST_GOOD_PATH = '/__gitall_internal/last-good/';

describe('embed route GET', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it('returns 503 no-store SVG when all platforms fail transiently', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest('https://gitall.app/embed/octocat.svg'),
      makeParams('octocat.svg'),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Retry-After')).toBe('60');
    const body = await response.text();
    expect(body).toMatch(/^<svg /);
    expect(body).toContain('Data temporarily unavailable');
  });

  it('returns 503 when an upstream 5xx is the only failure', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"error":"boom"}', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest('https://gitall.app/embed/octocat.svg'),
      makeParams('octocat.svg'),
    );

    expect(response.status).toBe(503);
  });

  it('returns cacheable 404 SVG when every platform reports user not found', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('{"error":"not found"}', { status: 404 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest('https://gitall.app/embed/nobody.svg'),
      makeParams('nobody.svg'),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=3600');
    expect(response.headers.get('Retry-After')).toBeNull();
    const body = await response.text();
    expect(body).toContain('No contribution data found');
  });

  it('prefers 503 over 404 when failures are a mix of not-found and transient', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('{"error":"not found"}', { status: 404 }),
      )
      .mockRejectedValueOnce(new DOMException('Timeout', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest(
        'https://gitall.app/embed/myslug?github=octocat&gitlab=jdoe',
      ),
      makeParams('myslug'),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  describe('last-known-good fallback', () => {
    const url = 'https://gitall.app/embed/octocat.svg?theme=dark';

    async function renderOnce(fetchImpl: typeof fetch) {
      vi.stubGlobal('fetch', fetchImpl);
      return GET(createRequest(url), makeParams('octocat.svg'));
    }

    it('stores a long-lived fallback copy alongside the primary entry', async () => {
      const { store } = stubMemoryCache();

      const response = await renderOnce(
        vi.fn<typeof fetch>().mockResolvedValue(makeContributionResponse()),
      );

      expect(response.status).toBe(200);
      expect(store.has(url)).toBe(true);
      const fallbackKey = [...store.keys()].find((k) =>
        k.includes(LAST_GOOD_PATH),
      );
      expect(fallbackKey).toBeDefined();
      expect(store.get(fallbackKey!)?.headers.get('Cache-Control')).toBe(
        'public, s-maxage=604800',
      );
    });

    it('serves the last good SVG as stale when providers fail transiently', async () => {
      const { store } = stubMemoryCache();
      const fresh = await renderOnce(
        vi.fn<typeof fetch>().mockResolvedValue(makeContributionResponse()),
      );
      const freshBody = await fresh.text();

      // Primary entry expires; the fallback copy is still there.
      store.delete(url);

      const response = await renderOnce(
        vi
          .fn<typeof fetch>()
          .mockRejectedValue(new DOMException('Timeout', 'AbortError')),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
      expect(response.headers.get('x-gitall-stale')).toBe('1');
      expect(response.headers.get('x-gitall-platforms')).toBe('github');
      expect(await response.text()).toBe(freshBody);
      // The stale copy is not written back as the primary entry, so the next
      // request retries the upstream.
      expect(store.has(url)).toBe(false);
    });

    it('does not treat the reserved query parameter as a fallback cache hit', async () => {
      const { store } = stubMemoryCache();
      await renderOnce(
        vi.fn<typeof fetch>().mockResolvedValue(makeContributionResponse()),
      );

      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(makeContributionResponse());
      vi.stubGlobal('fetch', fetchMock);
      const response = await GET(
        createRequest(
          'https://gitall.app/embed/octocat.svg?__gitall_last_good=1&theme=dark',
        ),
        makeParams('octocat.svg'),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('x-gitall-stale')).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(
        [...store.keys()].some(
          (key) =>
            key.includes(LAST_GOOD_PATH) &&
            key.includes('__gitall_last_good=1'),
        ),
      ).toBe(true);
    });

    it('returns 503 when there is no fallback for the URL', async () => {
      stubMemoryCache();
      const response = await renderOnce(
        vi.fn<typeof fetch>().mockRejectedValue(new Error('network error')),
      );
      expect(response.status).toBe(503);
    });

    it('does not serve the fallback when the user is definitively not found', async () => {
      const { store } = stubMemoryCache();
      await renderOnce(
        vi.fn<typeof fetch>().mockResolvedValue(makeContributionResponse()),
      );
      store.delete(url);

      const response = await renderOnce(
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response('{"error":"not found"}', { status: 404 }),
          ),
      );

      expect(response.status).toBe(404);
      expect(response.headers.get('x-gitall-stale')).toBeNull();
    });
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

  it('serves the auto theme when no theme param is given', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeContributionResponse());
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest('https://gitall.app/embed/octocat.svg'),
      makeParams('octocat.svg'),
    );

    const body = await response.text();
    // Both palettes ship in one file, switched by prefers-color-scheme.
    expect(body).toContain('@media (prefers-color-scheme:dark)');
  });

  it('applies the dark theme when ?theme=dark is set', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeContributionResponse());
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest('https://gitall.app/embed/octocat.svg?theme=dark'),
      makeParams('octocat.svg'),
    );

    const body = await response.text();
    // Dark background color
    expect(body).toContain('#161b22');
    expect(body).not.toContain('#f6f8fa');
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
