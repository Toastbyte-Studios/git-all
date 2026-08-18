import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest } from 'next/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics-events';
import { trackServerEvent } from '@/lib/analytics-server';
import type { EmbedTheme } from '@/lib/embed-svg';
import type { ContributionData, Platform } from '@/lib/types';

// Shared pipeline behind both embed routes:
//
//   /embed/[slug]      — usernames supplied in the URL (anonymous, snapshot)
//   /embed/u/[handle]  — usernames resolved from a profile (live)
//
// Everything here was previously private to /embed/[slug]/route.ts. It lives in
// one place so the two routes cannot drift apart in how they merge, cache, or
// fail — particularly `svgError`, which both rely on to be indistinguishable
// across error causes.

/** Approximate base URL for the "Powered by GitAll" watermark link. */
export const SITE_URL = 'https://gitall.app';

// Hard deadline per upstream platform fetch. GitHub's camo proxy only waits
// a few seconds for the image before rendering a broken placeholder, so a
// single hung platform must degrade to a partial heatmap (that platform is
// simply omitted from the merge) rather than stall the whole response past
// camo's timeout.
export const PLATFORM_FETCH_TIMEOUT_MS = 4000;

export type EmbedSource = 'slug' | 'handle';

export interface EmbedPlatformEntry {
  platform: Platform;
  username: string;
  instanceUrl?: string | null;
}

/**
 * Returns the Workers global cache, or `null` outside a Worker runtime
 * (`next dev`, Vitest) where `caches.default` does not exist.
 */
export function getEdgeCache(): Cache | null {
  const globalCaches = (globalThis as { caches?: { default?: Cache } }).caches;
  return globalCaches?.default ?? null;
}

/**
 * Registers background work with the Worker execution context so it is not
 * cancelled when the response is returned. Falls back to a floating promise
 * outside a Worker, where the process is long-lived anyway.
 */
export function runAfterResponse(work: Promise<unknown>): void {
  try {
    getCloudflareContext().ctx.waitUntil(work);
  } catch {
    void work;
  }
}

/** Accept both `/embed/octocat` and `/embed/octocat.svg`. */
export function stripSvgExtension(slug: string): string {
  return slug.endsWith('.svg') ? slug.slice(0, -4) : slug;
}

/**
 * `auto` is the default: it ships both palettes in one SVG and switches on the
 * reader's OS color-scheme preference. Every embed URL already in the wild
 * omits this param, so they all resolve here — which is deliberate. `light`
 * and `dark` pin a single palette for readers who need it, most often on
 * GitHub, whose theme is an account setting rather than an OS one.
 */
export function resolveTheme(raw: string | null): EmbedTheme {
  return raw === 'light' || raw === 'dark' ? raw : 'auto';
}

export function buildEmbedCacheKey(
  request: NextRequest,
  version: number,
): Request {
  const url = new URL(request.url);
  url.searchParams.set('v', String(version));
  return new Request(url.toString(), { method: 'GET' });
}

/**
 * Discriminated result from a single upstream platform fetch.
 *
 * - `ok: true`  — data was returned successfully.
 * - `not_found` — the upstream gave a definitive 404 (user does not exist).
 * - `transient`  — upstream returned 5xx, timed out, rate-limited, or we
 *   couldn't parse the response. Never cache a 404 derived from a transient
 *   failure; that would serve broken embeds to real users during outages.
 */
export type PlatformResult =
  | { ok: true; data: ContributionData }
  | { ok: false; reason: 'not_found' | 'transient' };

/**
 * Result from `fetchContributions`.
 *
 * `hasTransient` is `true` when at least one platform returned a transient
 * (non-definitive) failure. The caller uses this to decide whether a 404
 * response is safe to cache: it is only safe when every platform that failed
 * did so definitively.
 */
export interface FetchContributionsResult {
  data: ContributionData[];
  hasTransient: boolean;
}

/**
 * Fetches every entry in parallel and drops the ones that fail.
 *
 * NOTE: these loop back through our own public /api/* routes from the server's
 * egress IP. Keep any Cloudflare rate limiting rule scoped to /embed/* only — a
 * per-IP limit on /api/* would throttle this endpoint's own internal calls
 * under load.
 */
export async function fetchContributions(
  origin: string,
  entries: EmbedPlatformEntry[],
  from: string,
  to: string,
): Promise<FetchContributionsResult> {
  const results = await Promise.all(
    entries.map((entry) =>
      fetchPlatformContributions(buildPlatformUrl(origin, entry, from, to)),
    ),
  );
  const data = results
    .filter((r): r is { ok: true; data: ContributionData } => r.ok)
    .map((r) => r.data);
  const hasTransient = results.some((r) => !r.ok && r.reason === 'transient');
  return { data, hasTransient };
}

function buildPlatformUrl(
  origin: string,
  entry: EmbedPlatformEntry,
  from: string,
  to: string,
): string {
  const params = new URLSearchParams({ username: entry.username, from, to });
  if (entry.platform === 'gitea' && entry.instanceUrl) {
    params.set('instanceUrl', entry.instanceUrl);
  }
  return `${origin}/api/${entry.platform}?${params}`;
}

async function fetchPlatformContributions(
  url: string,
): Promise<PlatformResult> {
  try {
    const response = await fetch(url, {
      headers: { 'x-gitall-internal': 'embed' },
      signal: AbortSignal.timeout(PLATFORM_FETCH_TIMEOUT_MS),
    });

    // Definitive user-not-found from upstream.
    if (response.status === 404) return { ok: false, reason: 'not_found' };

    // Rate limiting is transient: a 429, or a GitHub 403 with
    // x-ratelimit-remaining: 0. Misclassifying this as not_found would cache
    // mass 404s for real users at exactly the moment the system is under load.
    if (response.status === 429) return { ok: false, reason: 'transient' };
    if (
      response.status === 403 &&
      response.headers.get('x-ratelimit-remaining') === '0'
    ) {
      return { ok: false, reason: 'transient' };
    }

    // Any other non-2xx (e.g. 5xx server error) is transient.
    if (!response.ok) return { ok: false, reason: 'transient' };

    const data: ContributionData & { error?: string } = await response.json();

    if (data.error) {
      // A "user not found" style error body from the API is definitive.
      // Anything else (quota exhausted, internal error, etc.) is transient.
      const lower = data.error.toLowerCase();
      const definitive =
        lower.includes('not found') ||
        lower.includes('does not exist') ||
        lower.includes('no such user');
      return {
        ok: false,
        reason: definitive ? 'not_found' : 'transient',
      };
    }

    return { ok: true, data };
  } catch {
    // Covers network errors, JSON parse failures, and the AbortSignal
    // timeout — all degrade to a transient failure rather than a definitive
    // not_found, because we cannot tell whether the user exists.
    return { ok: false, reason: 'transient' };
  }
}

export function mergeContributions(
  sources: ContributionData[],
): ContributionData {
  if (sources.length === 1) return sources[0];

  const map = new Map<string, number>();

  for (const data of sources) {
    for (const entry of data.calendar) {
      map.set(entry.date, (map.get(entry.date) ?? 0) + entry.count);
    }
  }

  const calendar = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count, level: countToLevel(count) }));

  const totalContributions = calendar.reduce((sum, day) => sum + day.count, 0);

  return {
    platform: 'integrated',
    username: sources.map((d) => d.username).join(' + '),
    totalContributions,
    dateRange: {
      from: calendar[0]?.date ?? null,
      to: calendar[calendar.length - 1]?.date ?? null,
    },
    calendar,
  };
}

function countToLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 7) return 2;
  if (count <= 15) return 3;
  return 4;
}

export function trackEmbedServed(
  request: NextRequest,
  platforms: string | null,
  theme: EmbedTheme,
  cacheStatus: 'hit' | 'miss',
  source: EmbedSource,
): void {
  const refererHost = (() => {
    try {
      return new URL(request.headers.get('Referer') ?? '').hostname;
    } catch {
      return undefined;
    }
  })();

  trackServerEvent(request, ANALYTICS_EVENTS.embedServed, {
    platforms: platforms ?? 'unknown',
    platform_count: platforms ? platforms.split('+').length : 0,
    theme,
    cache_status: cacheStatus,
    source,
    ...(refererHost ? { referer_host: refererHost } : {}),
  });
}

/**
 * Return a minimal SVG carrying an error message.
 *
 * Callers on the handle route MUST NOT vary this message by cause. A private
 * profile and a nonexistent one have to produce identical responses, or the
 * endpoint becomes an existence oracle for any guessable handle — see the
 * contract on `getPublicProfileByHandle`.
 *
 * `cacheDirective` overrides the default `no-store`. Keep the default for any
 * call site that has not been explicitly audited for cacheability. Pass a
 * `public, s-maxage=…` directive only for responses whose content is fully
 * determined by the request URL with no transient upstream dependency.
 */
export function svgError(
  message: string,
  status: number,
  cacheDirective = 'no-store',
): Response {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40"><rect width="200" height="40" rx="6" fill="#161b22"/><text x="10" y="24" fill="#f85149" font-size="11" font-family="system-ui,-apple-system,sans-serif">${escapeXml(message)}</text></svg>`;
  return new Response(svg, {
    status,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': cacheDirective,
      'X-Robots-Tag': 'noindex',
      Vary: 'Accept-Encoding',
    },
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
