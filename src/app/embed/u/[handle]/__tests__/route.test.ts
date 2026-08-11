import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContributionData, PublicProfile } from '@/lib/types';

const profiles = vi.hoisted(() => ({
  getPublicProfileByHandle:
    vi.fn<(handle: string) => Promise<PublicProfile | null>>(),
}));

vi.mock('@/lib/profiles', () => ({
  getPublicProfileByHandle: profiles.getPublicProfileByHandle,
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
  connections: PublicProfile['connections'] = [
    { provider: 'github', username: 'octocat', avatarUrl: null },
  ],
): PublicProfile {
  return {
    handle: 'jane-doe',
    displayName: 'Jane Doe',
    primaryProvider: 'github',
    connections,
  };
}

function stubEdgeCache(overrides?: {
  match?: (request: Request) => Promise<Response | undefined>;
  put?: (request: Request, response: Response) => Promise<void>;
}) {
  const cache = {
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  vi.stubGlobal('caches', { default: cache });
  return cache;
}

describe('handle embed route GET', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    profiles.getPublicProfileByHandle.mockReset();
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
    profiles.getPublicProfileByHandle.mockResolvedValue(null);

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
    expect(edgeCache.put).not.toHaveBeenCalled();
  });

  it('returns cacheable SVG responses and stores platform metadata on cache misses', async () => {
    const edgeCache = stubEdgeCache();
    profiles.getPublicProfileByHandle.mockResolvedValue(
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
    const [, cachedResponse] = edgeCache.put.mock.calls[0] as [
      Request,
      Response,
    ];
    expect(cachedResponse.headers.get('x-gitall-platforms')).toBe(
      'github+gitlab',
    );
  });

  it('serves cached SVG responses without re-resolving the profile or refetching data', async () => {
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

    const response = await GET(
      createRequest('https://gitall.app/embed/u/jane-doe.svg'),
      makeParams('jane-doe.svg'),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<svg>cached</svg>');
    expect(edgeCache.match).toHaveBeenCalledTimes(1);
    expect(edgeCache.put).not.toHaveBeenCalled();
    expect(profiles.getPublicProfileByHandle).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
