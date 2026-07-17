import { NextRequest } from 'next/server';
import {
  DEFAULT_CONTRIBUTION_PERIOD,
  getContributionDateRange,
} from '@/lib/contribution-period';
import { generateHeatmapSvg, type EmbedTheme } from '@/lib/embed-svg';
import type { ContributionData } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// OPERATIONAL CONSTRAINT (issue #96): this endpoint is consumed by GitHub's
// camo image proxy, which cannot execute JavaScript and therefore cannot pass
// Cloudflare bot challenges. Bot Fight Mode must stay OFF on the gitall.app
// zone — it applies zone-wide and CANNOT be skipped per-path with WAF custom
// rules on the free plan. Enabling it silently breaks every embedded heatmap
// in the wild. Abuse is mitigated instead by the 24h edge cache below, a
// Cloudflare rate limiting rule scoped to /embed/*, and the "Block AI bots"
// managed rule (issue #97). If the zone is ever upgraded to Pro, use Super
// Bot Fight Mode with a skip rule on /embed/* and /api/* instead.
// ─────────────────────────────────────────────────────────────────────────────

// 24-hour edge cache; stale responses are served for up to 1 hour while
// revalidating so that GitHub's camo proxy always gets a quick response.
const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=3600';

// Approximate base URL for the "Powered by GitAll" watermark link.
const SITE_URL = 'https://gitall.app';

// Hard deadline per upstream platform fetch. GitHub's camo proxy only waits
// a few seconds for the image before rendering a broken placeholder, so a
// single hung platform must degrade to a partial heatmap (that platform is
// simply omitted from the merge) rather than stall the whole response past
// camo's timeout.
const PLATFORM_FETCH_TIMEOUT_MS = 4000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Accept both /embed/octocat and /embed/octocat.svg
  const primaryUsername = slug.endsWith('.svg') ? slug.slice(0, -4) : slug;

  if (!primaryUsername) {
    return svgError('Missing username', 400);
  }

  const searchParams = request.nextUrl.searchParams;

  // Normalize: treat empty/whitespace-only param values the same as absent.
  // Without this, `?github=` sets hasExplicitParams=true but produces no fetch,
  // returning "No platform usernames provided" even when a valid path slug exists.
  const explicitGithub = searchParams.get('github')?.trim() || null;
  const gitlabUsername = searchParams.get('gitlab')?.trim() || null;
  const bitbucketUsername = searchParams.get('bitbucket')?.trim() || null;
  const giteaUsername = searchParams.get('gitea')?.trim() || null;
  const giteaInstance = searchParams.get('instance')?.trim() || null;

  // When no explicit platform params are given, the path username is the
  // GitHub username (simple single-platform case: /embed/octocat.svg).
  // When any explicit params are present, rely only on those params —
  // the path is treated as a URL slug and does not imply a GitHub lookup.
  const hasExplicitParams =
    explicitGithub !== null ||
    gitlabUsername !== null ||
    bitbucketUsername !== null ||
    giteaUsername !== null;

  const githubUsername = hasExplicitParams
    ? (explicitGithub ?? null)
    : primaryUsername;

  const rawTheme = searchParams.get('theme');
  const theme: EmbedTheme =
    rawTheme === 'light' || rawTheme === 'dark' ? rawTheme : 'dark';

  // Default to last 12 months
  const { from, to } = getContributionDateRange(DEFAULT_CONTRIBUTION_PERIOD);

  const origin = request.nextUrl.origin;

  // Fetch contributions from all requested platforms in parallel.
  // NOTE: these loop back through our own public /api/* routes from the
  // server's egress IP. Keep any Cloudflare rate limiting rule scoped to
  // /embed/* only — a per-IP limit on /api/* would throttle this endpoint's
  // own internal calls under load.
  const fetchTasks: Array<Promise<ContributionData | null>> = [];

  if (githubUsername) {
    fetchTasks.push(
      fetchPlatformContributions(
        `${origin}/api/github?username=${encodeURIComponent(githubUsername)}&from=${from}&to=${to}`,
      ),
    );
  }

  if (gitlabUsername) {
    fetchTasks.push(
      fetchPlatformContributions(
        `${origin}/api/gitlab?username=${encodeURIComponent(gitlabUsername)}&from=${from}&to=${to}`,
      ),
    );
  }

  if (bitbucketUsername) {
    fetchTasks.push(
      fetchPlatformContributions(
        `${origin}/api/bitbucket?username=${encodeURIComponent(bitbucketUsername)}&from=${from}&to=${to}`,
      ),
    );
  }

  if (giteaUsername) {
    const giteaParams = new URLSearchParams({
      username: giteaUsername,
      from,
      to,
    });
    if (giteaInstance) {
      giteaParams.set('instanceUrl', giteaInstance);
    }
    fetchTasks.push(
      fetchPlatformContributions(`${origin}/api/gitea?${giteaParams}`),
    );
  }

  if (fetchTasks.length === 0) {
    return svgError('No platform usernames provided', 400);
  }

  const results = await Promise.all(fetchTasks);
  const validResults = results.filter((r): r is ContributionData => r !== null);

  if (validResults.length === 0) {
    return svgError('No contribution data found', 404);
  }

  const merged = mergeContributions(validResults);
  const svg = generateHeatmapSvg(merged, { theme, siteUrl: SITE_URL });

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': CACHE_CONTROL,
      'X-Robots-Tag': 'noindex',
    },
  });
}

async function fetchPlatformContributions(
  url: string,
): Promise<ContributionData | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(PLATFORM_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data: ContributionData & { error?: string } = await response.json();
    if (data.error) return null;
    return data;
  } catch {
    // Covers network errors, JSON parse failures, and the AbortSignal
    // timeout — all degrade to "this platform contributes nothing".
    return null;
  }
}

function mergeContributions(sources: ContributionData[]): ContributionData {
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

/** Return a minimal SVG carrying an error message. */
function svgError(message: string, status: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40"><rect width="200" height="40" rx="6" fill="#161b22"/><text x="10" y="24" fill="#f85149" font-size="11" font-family="system-ui,-apple-system,sans-serif">${escapeXml(message)}</text></svg>`;
  return new Response(svg, {
    status,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
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
