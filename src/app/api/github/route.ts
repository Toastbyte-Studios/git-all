import { NextRequest, NextResponse } from 'next/server';
import { APP_USER_AGENT } from '@/lib/app-metadata';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_TTL_SECONDS = Math.floor(CACHE_TTL_MS / 1000);
const MAX_CACHE_ENTRIES = 500;
const CACHE_CONTROL_HEADER = `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=86400`;
const GITHUB_USERNAME_PATTERN = /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/;

const CONTRIBUTIONS_QUERY = `
  query($username: String!, $from: DateTime, $to: DateTime) {
    user(login: $username) {
      login
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              color
            }
          }
        }
      }
    }
  }
`;

const COLOR_TO_LEVEL: Record<string, number> = {
  '#ebedf0': 0,
  '#9be9a8': 1,
  '#40c463': 2,
  '#30a14e': 3,
  '#216e39': 4,
};

interface GithubContributionResponse {
  platform: 'github';
  username: string;
  totalContributions: number;
  dateRange: {
    from: string | null;
    to: string | null;
  };
  calendar: Array<{
    date: string;
    count: number;
    level: number;
  }>;
}

// This cache is intentionally per-instance; move it to Workers Cache or KV
// if the app needs shared caching across multiple runtimes.
const contributionCache = new Map<
  string,
  { data: GithubContributionResponse; expiresAt: number }
>();
const inFlightContributionRequests = new Map<
  string,
  Promise<GithubContributionResponse | null>
>();

function pruneExpiredEntries(now: number) {
  for (const [key, entry] of contributionCache.entries()) {
    if (entry.expiresAt <= now) {
      contributionCache.delete(key);
    }
  }
}

function getCachedContribution(cacheKey: string) {
  const now = Date.now();
  const cached = contributionCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= now) {
    contributionCache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

function setCachedContribution(
  cacheKey: string,
  data: GithubContributionResponse,
) {
  const now = Date.now();

  pruneExpiredEntries(now);

  const hadEntry = contributionCache.delete(cacheKey);

  if (!hadEntry && contributionCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = contributionCache.keys().next().value;
    if (oldestKey) {
      contributionCache.delete(oldestKey);
    }
  }

  contributionCache.set(cacheKey, {
    data,
    expiresAt: now + CACHE_TTL_MS,
  });
}

function createCachedResponse(
  body: GithubContributionResponse,
  cacheStatus: 'HIT' | 'MISS' | 'BYPASS',
) {
  return NextResponse.json(body, {
    headers: {
      'Cache-Control':
        cacheStatus === 'BYPASS' ? 'no-store' : CACHE_CONTROL_HEADER,
      'X-Cache': cacheStatus,
    },
  });
}

function getOrCreateInFlightContributionRequest(
  cacheKey: string,
  loadContribution: () => Promise<GithubContributionResponse | null>,
) {
  const existingRequest = inFlightContributionRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = loadContribution().finally(() => {
    if (inFlightContributionRequests.get(cacheKey) === request) {
      inFlightContributionRequests.delete(cacheKey);
    }
  });

  inFlightContributionRequests.set(cacheKey, request);
  return request;
}

export async function GET(request: NextRequest) {
  const requestedUsername = request.nextUrl.searchParams
    .get('username')
    ?.trim();
  if (!requestedUsername) {
    return NextResponse.json(
      { error: 'Missing username parameter' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!GITHUB_USERNAME_PATTERN.test(requestedUsername)) {
    return NextResponse.json(
      {
        error:
          'Invalid GitHub username. Usernames must be 1-39 characters long, contain only letters, numbers, and hyphens, and cannot start or end with a hyphen.',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const username = requestedUsername.toLowerCase();

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'Server misconfiguration: GITHUB_TOKEN is not set.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
    // Keep the key shaped as platform:username so the cache structure can stay
    // consistent if other contribution sources adopt the same strategy later.
    const cacheKey = `github:${username}`;
    const cached = getCachedContribution(cacheKey);

    if (!refresh && cached) {
      return createCachedResponse(cached, 'HIT');
    }

    const payload = await getOrCreateInFlightContributionRequest(
      cacheKey,
      async () => {
        const now = new Date();
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const response = await fetch(GITHUB_GRAPHQL_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': APP_USER_AGENT,
          },
          body: JSON.stringify({
            query: CONTRIBUTIONS_QUERY,
            variables: {
              username,
              from: oneYearAgo.toISOString(),
              to: now.toISOString(),
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`GitHub API returned ${response.status}`);
        }

        const json = await response.json();

        if (json.errors) {
          throw new Error(
            json.errors.map((e: { message: string }) => e.message).join('; '),
          );
        }

        const user = json.data?.user;
        if (!user) {
          return null;
        }

        const calendar = user.contributionsCollection.contributionCalendar;
        const days = calendar.weeks.flatMap(
          (w: {
            contributionDays: Array<{
              date: string;
              contributionCount: number;
              color: string;
            }>;
          }) => w.contributionDays,
        );

        const freshPayload: GithubContributionResponse = {
          platform: 'github',
          username: user.login,
          totalContributions: calendar.totalContributions,
          dateRange: {
            from: days[0]?.date ?? null,
            to: days[days.length - 1]?.date ?? null,
          },
          calendar: days.map(
            (d: {
              date: string;
              contributionCount: number;
              color: string;
            }) => ({
              date: d.date,
              count: d.contributionCount,
              level: COLOR_TO_LEVEL[d.color.toLowerCase()] ?? 0,
            }),
          ),
        };

        setCachedContribution(cacheKey, freshPayload);
        return freshPayload;
      },
    );

    if (!payload) {
      return NextResponse.json(
        { error: `GitHub user '${username}' not found.` },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return createCachedResponse(payload, refresh ? 'BYPASS' : 'MISS');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
