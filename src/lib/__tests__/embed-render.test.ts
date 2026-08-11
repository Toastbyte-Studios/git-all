import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchContributions,
  mergeContributions,
  svgError,
  type EmbedPlatformEntry,
} from '../embed-render';
import type { ContributionData } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeContributionData(
  platform: ContributionData['platform'] = 'github',
  username = 'octocat',
): ContributionData {
  return {
    platform,
    username,
    totalContributions: 10,
    dateRange: { from: '2025-01-01', to: '2025-01-07' },
    calendar: [{ date: '2025-01-01', count: 10, level: 2 }],
  };
}

const ORIGIN = 'https://gitall.app';

const ENTRIES: EmbedPlatformEntry[] = [
  { platform: 'github', username: 'octocat' },
];

const MULTI_ENTRIES: EmbedPlatformEntry[] = [
  { platform: 'github', username: 'octocat' },
  { platform: 'gitlab', username: 'octolab' },
];

// ─────────────────────────────────────────────────────────────────────────────
// fetchContributions
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchContributions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeFetch(
    status: number,
    body?: object,
    headers?: Record<string, string>,
  ) {
    return vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (name: string) => headers?.[name.toLowerCase()] ?? null,
      },
      json: () =>
        body !== undefined
          ? Promise.resolve(body)
          : Promise.reject(new Error('no body')),
    });
  }

  it('returns data and hasTransient=false on success', async () => {
    const data = makeContributionData();
    vi.stubGlobal('fetch', makeFetch(200, data));

    const result = await fetchContributions(
      ORIGIN,
      ENTRIES,
      '2025-01-01',
      '2025-01-31',
    );

    expect(result.hasTransient).toBe(false);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].username).toBe('octocat');
  });

  // Test 1: genuine 404 → cacheable (not_found, hasTransient=false)
  it('classifies upstream 404 as not_found and hasTransient=false', async () => {
    vi.stubGlobal('fetch', makeFetch(404));

    const result = await fetchContributions(
      ORIGIN,
      ENTRIES,
      '2025-01-01',
      '2025-01-31',
    );

    expect(result.data).toHaveLength(0);
    expect(result.hasTransient).toBe(false);
  });

  // Test 2: upstream timeout → no-store (transient, hasTransient=true)
  it('classifies AbortSignal timeout as transient and hasTransient=true', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValue(
          Object.assign(
            new DOMException('The operation was aborted.', 'AbortError'),
            {},
          ),
        ),
    );

    const result = await fetchContributions(
      ORIGIN,
      ENTRIES,
      '2025-01-01',
      '2025-01-31',
    );

    expect(result.data).toHaveLength(0);
    expect(result.hasTransient).toBe(true);
  });

  // Test 3: upstream 5xx → no-store (transient, hasTransient=true)
  it('classifies 5xx responses as transient and hasTransient=true', async () => {
    vi.stubGlobal('fetch', makeFetch(503));

    const result = await fetchContributions(
      ORIGIN,
      ENTRIES,
      '2025-01-01',
      '2025-01-31',
    );

    expect(result.data).toHaveLength(0);
    expect(result.hasTransient).toBe(true);
  });

  // Test 4a: 429 rate limit → transient
  it('classifies 429 rate limit as transient', async () => {
    vi.stubGlobal('fetch', makeFetch(429));

    const result = await fetchContributions(
      ORIGIN,
      ENTRIES,
      '2025-01-01',
      '2025-01-31',
    );

    expect(result.hasTransient).toBe(true);
  });

  // Test 4b: GitHub 403 + x-ratelimit-remaining: 0 → transient
  it('classifies GitHub 403 with x-ratelimit-remaining: 0 as transient', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch(403, undefined, { 'x-ratelimit-remaining': '0' }),
    );

    const result = await fetchContributions(
      ORIGIN,
      ENTRIES,
      '2025-01-01',
      '2025-01-31',
    );

    expect(result.hasTransient).toBe(true);
  });

  // Test 4c: plain 403 without rate limit header → transient (not 404)
  it('classifies plain 403 (non rate-limit) as transient', async () => {
    vi.stubGlobal('fetch', makeFetch(403));

    const result = await fetchContributions(
      ORIGIN,
      ENTRIES,
      '2025-01-01',
      '2025-01-31',
    );

    expect(result.hasTransient).toBe(true);
  });

  // Test 5 (THE KEY CASE): one platform 404, another times out → hasTransient=true → no-store
  it('is transient when one platform is 404 and another times out (mixed case)', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First platform: definitive 404
          return Promise.resolve({
            ok: false,
            status: 404,
            headers: { get: () => null },
          });
        }
        // Second platform: transient timeout
        return Promise.reject(
          new DOMException('The operation was aborted.', 'AbortError'),
        );
      }),
    );

    const result = await fetchContributions(
      ORIGIN,
      MULTI_ENTRIES,
      '2025-01-01',
      '2025-01-31',
    );

    expect(result.data).toHaveLength(0);
    // Even though one platform gave a definitive 404, the other timed out.
    // The whole result must be transient to prevent caching a 404 during an outage.
    expect(result.hasTransient).toBe(true);
  });

  // Test 7: successful renders unaffected — multiple platforms merge correctly
  it('merges results from multiple successful platforms', async () => {
    const githubData = makeContributionData('github', 'octocat');
    const gitlabData = makeContributionData('gitlab', 'octolab');
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        const body = callCount === 1 ? githubData : gitlabData;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: () => Promise.resolve(body),
        });
      }),
    );

    const result = await fetchContributions(
      ORIGIN,
      MULTI_ENTRIES,
      '2025-01-01',
      '2025-01-31',
    );

    expect(result.hasTransient).toBe(false);
    expect(result.data).toHaveLength(2);
  });

  it('classifies error body with "not found" message as not_found', async () => {
    vi.stubGlobal('fetch', makeFetch(200, { error: 'User not found' }));

    const result = await fetchContributions(
      ORIGIN,
      ENTRIES,
      '2025-01-01',
      '2025-01-31',
    );

    expect(result.data).toHaveLength(0);
    expect(result.hasTransient).toBe(false);
  });

  it('classifies error body with generic error message as transient', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch(200, { error: 'Internal quota exceeded' }),
    );

    const result = await fetchContributions(
      ORIGIN,
      ENTRIES,
      '2025-01-01',
      '2025-01-31',
    );

    expect(result.data).toHaveLength(0);
    expect(result.hasTransient).toBe(true);
  });

  it('classifies JSON parse failure as transient', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      }),
    );

    const result = await fetchContributions(
      ORIGIN,
      ENTRIES,
      '2025-01-01',
      '2025-01-31',
    );

    expect(result.data).toHaveLength(0);
    expect(result.hasTransient).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// svgError
// ─────────────────────────────────────────────────────────────────────────────

describe('svgError', () => {
  // Test 6: 400 validation errors → cacheable
  it('uses public s-maxage=86400 when explicitly passed for 400', () => {
    const response = svgError(
      'Missing username',
      400,
      'public, s-maxage=86400',
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=86400',
    );
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('defaults to no-store when no cache directive is supplied', () => {
    const response = svgError('some error', 400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('uses public s-maxage=3600 for cacheable 404', () => {
    const response = svgError(
      'No contribution data found',
      404,
      'public, s-maxage=3600',
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=3600');
  });

  it('keeps no-store for transient 404', () => {
    const response = svgError('No contribution data found', 404, 'no-store');
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('always sets X-Robots-Tag: noindex', () => {
    expect(svgError('x', 400).headers.get('X-Robots-Tag')).toBe('noindex');
    expect(svgError('x', 404, 'no-store').headers.get('X-Robots-Tag')).toBe(
      'noindex',
    );
    expect(
      svgError('x', 404, 'public, s-maxage=3600').headers.get('X-Robots-Tag'),
    ).toBe('noindex');
  });

  it('always sets Content-Type image/svg+xml', async () => {
    const r = svgError('oops', 500);
    expect(r.headers.get('Content-Type')).toContain('image/svg+xml');
    const body = await r.text();
    expect(body).toMatch(/^<svg /);
  });

  // Test 8: private profile and nonexistent handle produce byte-identical responses.
  // Both go through svgError('Profile not found', 404, 'public, s-maxage=3600').
  // This test asserts that calling svgError with the same args twice yields
  // identical headers and body so no oracle exists for distinguishing the two cases.
  it('produces byte-identical responses for same arguments (no oracle across causes)', async () => {
    const r1 = svgError('Profile not found', 404, 'public, s-maxage=3600');
    const r2 = svgError('Profile not found', 404, 'public, s-maxage=3600');

    expect(r1.status).toBe(r2.status);
    expect(r1.headers.get('Cache-Control')).toBe(
      r2.headers.get('Cache-Control'),
    );
    expect(r1.headers.get('Content-Type')).toBe(r2.headers.get('Content-Type'));
    expect(r1.headers.get('X-Robots-Tag')).toBe(r2.headers.get('X-Robots-Tag'));
    expect(await r1.text()).toBe(await r2.text());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mergeContributions (unchanged, smoke test)
// ─────────────────────────────────────────────────────────────────────────────

describe('mergeContributions', () => {
  // Test 7: successful merge behaviour unaffected
  it('sums contributions from multiple sources', () => {
    const a = makeContributionData('github', 'octocat');
    const b = makeContributionData('gitlab', 'octolab');
    const merged = mergeContributions([a, b]);
    expect(merged.platform).toBe('integrated');
    expect(merged.totalContributions).toBe(20);
  });

  it('returns source directly when only one entry', () => {
    const data = makeContributionData();
    expect(mergeContributions([data])).toBe(data);
  });
});
