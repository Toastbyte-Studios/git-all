import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicProfileWithUpdatedAt } from '@/lib/profiles';
import type { ContributionData } from '@/lib/types';

const profiles = vi.hoisted(() => ({
  getPublicProfileWithUpdatedAtByHandle:
    vi.fn<(handle: string) => Promise<PublicProfileWithUpdatedAt | null>>(),
}));

vi.mock('@/lib/profiles', () => ({
  getPublicProfileWithUpdatedAtByHandle:
    profiles.getPublicProfileWithUpdatedAtByHandle,
}));

const { GET } = await import('../route');

function createRequest(url: string) {
  return new NextRequest(url);
}

function makeParams(handle: string) {
  return { params: Promise.resolve({ handle }) };
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

function makeProfile(
  connections: PublicProfileWithUpdatedAt['connections'] = [
    { provider: 'github', username: 'octocat', avatarUrl: null },
  ],
): PublicProfileWithUpdatedAt {
  return {
    handle: 'jane-doe',
    displayName: 'Jane Doe',
    primaryProvider: 'github',
    updatedAt: 1_717_777_777_000,
    connections,
  };
}

function stubEdgeCache(overrides?: {
  match?: (request: Request) => Promise<Response | undefined>;
  put?: (request: Request, response: Response) => Promise<void>;
}) {
  const cache = {
    match: overrides?.match
      ? vi.fn(overrides.match)
      : vi
          .fn<(request: Request) => Promise<Response | undefined>>()
          .mockResolvedValue(undefined),
    put: overrides?.put
      ? vi.fn(overrides.put)
      : vi
          .fn<(request: Request, response: Response) => Promise<void>>()
          .mockResolvedValue(undefined),
  };
  vi.stubGlobal('caches', { default: cache });
  return cache;
}

describe('handle embed route GET', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    profiles.getPublicProfileWithUpdatedAtByHandle.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns identical 404 responses for missing and private handles', async () => {
    const edgeCache = stubEdgeCache();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    profiles.getPublicProfileWithUpdatedAtByHandle.mockResolvedValue(null);

    const missing = await GET(
      createRequest('https://gitall.app/embed/u/missing.svg'),
      makeParams('missing.svg'),
    );
    const missingBody = await missing.text();

    const privateProfile = await GET(
      createRequest('https://gitall.app/embed/u/private-user.svg'),
      makeParams('private-user.svg'),
    );
    const privateBody = await privateProfile.text();

    expect(missing.status).toBe(404);
    expect(privateProfile.status).toBe(404);
    expect(privateBody).toBe(missingBody);
    expect(privateProfile.headers.get('Cache-Control')).toBe(
      missing.headers.get('Cache-Control'),
    );
    expect(privateProfile.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(fetchMock).not.toHaveBeenCalled();
    // Both responses are now cached (cacheable 404), and they produce the same
    // Cache-Control so no oracle exists distinguishing private from nonexistent.
    expect(edgeCache.put).toHaveBeenCalledTimes(2);
  });

  it('returns cacheable SVG responses and stores platform metadata on cache misses', async () => {
    const edgeCache = stubEdgeCache();
    profiles.getPublicProfileWithUpdatedAtByHandle.mockResolvedValue(
      makeProfile([
        { provider: 'github', username: 'octocat', avatarUrl: null },
        { provider: 'gitlab', username: 'jdoe', avatarUrl: null },
      ]),
    );

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeContributionResponse({ platform: 'github' }))
      .mockResolvedValueOnce(
        makeContributionResponse({ platform: 'gitlab', username: 'jdoe' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      createRequest('https://gitall.app/embed/u/jane-doe.svg?theme=light'),
      makeParams('jane-doe.svg'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=3600, stale-while-revalidate=600',
    );
    expect(response.headers.get('Vary')).toBe('Accept-Encoding');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(response.headers.get('x-gitall-platforms')).toBe('github+gitlab');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(edgeCache.put).toHaveBeenCalledTimes(1);
    const [cacheRequest, cachedResponse] = edgeCache.put.mock.calls[0] as [
      Request,
      Response,
    ];
    expect(cacheRequest.url).toContain('theme=light');
    expect(cacheRequest.url).toContain('v=1717777777000');
    const [, cachedBody] = cacheRequest.url.split('/embed/u/');
    expect(cachedBody?.startsWith('jane-doe.svg')).toBe(true);
    expect(cachedResponse.headers.get('x-gitall-platforms')).toBe(
      'github+gitlab',
    );
  });

  it('re-resolves the profile before serving a cache hit so stale entries stop matching after profile updates', async () => {
    const cachedResponse = new Response('<svg>cached</svg>', {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
        'X-Robots-Tag': 'noindex',
        'x-gitall-platforms': 'github',
      },
    });
    const edgeCache = stubEdgeCache({
      match: vi.fn().mockResolvedValue(cachedResponse),
    });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    profiles.getPublicProfileWithUpdatedAtByHandle.mockResolvedValue(
      makeProfile(),
    );

    const response = await GET(
      createRequest('https://gitall.app/embed/u/jane-doe.svg'),
      makeParams('jane-doe.svg'),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<svg>cached</svg>');
    expect(profiles.getPublicProfileWithUpdatedAtByHandle).toHaveBeenCalledWith(
      'jane-doe',
    );
    expect(edgeCache.match).toHaveBeenCalledTimes(1);
    const [cacheRequest] = edgeCache.match.mock.calls[0] as [Request];
    expect(cacheRequest.url).toContain('v=1717777777000');
    expect(edgeCache.put).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bypasses the edge cache entirely when the profile is missing or private', async () => {
    const edgeCache = stubEdgeCache();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    profiles.getPublicProfileWithUpdatedAtByHandle.mockResolvedValue(null);

    const response = await GET(
      createRequest('https://gitall.app/embed/u/missing.svg'),
      makeParams('missing.svg'),
    );

    expect(response.status).toBe(404);
    // Checks the profile-not-found sentinel key before storing it.
    expect(edgeCache.match).toHaveBeenCalledTimes(1);
    // Cacheable profile-not-found is stored in the edge cache on a miss.
    expect(edgeCache.put).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
