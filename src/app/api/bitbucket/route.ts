import { NextRequest, NextResponse } from 'next/server';
import { APP_USER_AGENT } from '@/lib/app-metadata';
import {
  formatUtcDate,
  normalizeRequestedContributionRange,
  parseDateInput,
} from '@/lib/contribution-period';

const BITBUCKET_API_BASE = 'https://api.bitbucket.org/2.0';
const BITBUCKET_SLUG_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;
const BITBUCKET_URL_PREFIX = /^(?:https?:\/\/)?bitbucket\.org\/([^/?#]+)/i;
const BITBUCKET_PAGE_SIZE = 100;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_TTL_SECONDS = Math.floor(CACHE_TTL_MS / 1000);
const CACHE_CONTROL_HEADER = `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=86400`;
const MAX_CACHE_ENTRIES = 500;
const MAX_REPOSITORY_LIST_PAGES = 2;
const MAX_REPOSITORIES = 25;
const MAX_COMMIT_PAGES_PER_REPOSITORY = 2;

interface BitbucketRepository {
  slug: string;
  owner?: {
    account_id?: string;
    nickname?: string;
  };
}

interface BitbucketPaginatedResponse<T> {
  values: T[];
  next?: string;
}

interface BitbucketUser {
  account_id?: string;
  nickname: string;
  workspace: string;
}

interface BitbucketCommit {
  date: string;
  author?: {
    user?: {
      account_id?: string;
      nickname?: string;
      username?: string;
    };
  };
}

interface BitbucketContributionResponse {
  platform: 'bitbucket';
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

const contributionCache = new Map<
  string,
  { data: BitbucketContributionResponse; expiresAt: number }
>();
const inFlightContributionRequests = new Map<
  string,
  Promise<BitbucketContributionResponse>
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
  data: BitbucketContributionResponse,
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
  body: BitbucketContributionResponse,
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
  loadContribution: () => Promise<BitbucketContributionResponse>,
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
  const rawInput = request.nextUrl.searchParams.get('username')?.trim();

  if (!rawInput) {
    return NextResponse.json(
      { error: 'Missing Bitbucket workspace parameter' },
      { status: 400 },
    );
  }

  // Accept full profile URLs: https://bitbucket.org/workspace-slug/...
  const urlMatch = rawInput.match(BITBUCKET_URL_PREFIX);
  const requestedUsername = urlMatch ? urlMatch[1] : rawInput;

  if (!BITBUCKET_SLUG_PATTERN.test(requestedUsername)) {
    return NextResponse.json(
      {
        error:
          'Invalid Bitbucket workspace. Enter your workspace slug or paste your bitbucket.org profile URL.',
      },
      { status: 400 },
    );
  }

  const username = requestedUsername.toLowerCase();
  const requestedRange = normalizeRequestedRange(request);

  if ('error' in requestedRange) {
    return NextResponse.json({ error: requestedRange.error }, { status: 400 });
  }

  const fromDate = parseDateInput(requestedRange.from);
  const toDate = parseDateInput(requestedRange.to);

  if (!fromDate || !toDate) {
    return NextResponse.json(
      { error: 'Invalid contribution date range.' },
      { status: 400 },
    );
  }

  const fromMs = fromDate.getTime();
  const toExclusiveMs = toDate.getTime() + 24 * 60 * 60 * 1000;
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
  const cacheKey = `bitbucket:${username}:${requestedRange.from}:${requestedRange.to}`;

  try {
    const cached = getCachedContribution(cacheKey);
    if (!refresh && cached) {
      return createCachedResponse(cached, 'HIT');
    }

    const payload = await getOrCreateInFlightContributionRequest(
      cacheKey,
      async () => {
        const repositories = await fetchAllRepositories(username);

        // Extract account_id from repo owner — more reliable than a separate
        // /users lookup since it works with nicknames and avoids a deprecated endpoint
        const user: BitbucketUser = {
          nickname: repositories[0]?.owner?.nickname ?? username,
          account_id: repositories[0]?.owner?.account_id,
          workspace: username,
        };

        const counts = new Map<string, number>();
        for (const repo of repositories) {
          await aggregateRepositoryCommits({
            user,
            repoSlug: repo.slug,
            fromMs,
            toExclusiveMs,
            counts,
          });
        }

        const calendar: Array<{ date: string; count: number; level: number }> =
          [];
        const cursor = new Date(fromDate.getTime());

        while (cursor.getTime() < toExclusiveMs) {
          const date = formatUtcDate(cursor);
          const count = counts.get(date) ?? 0;
          calendar.push({
            date,
            count,
            level: countToLevel(count),
          });
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        const totalContributions = calendar.reduce(
          (sum, day) => sum + day.count,
          0,
        );

        const responsePayload: BitbucketContributionResponse = {
          platform: 'bitbucket',
          username,
          totalContributions,
          dateRange: {
            from: calendar[0]?.date ?? null,
            to: calendar[calendar.length - 1]?.date ?? null,
          },
          calendar,
        };

        setCachedContribution(cacheKey, responsePayload);
        return responsePayload;
      },
    );

    return createCachedResponse(payload, refresh ? 'BYPASS' : 'MISS');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json(
      { error: message },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

async function fetchAllRepositories(username: string) {
  const repositories: BitbucketRepository[] = [];
  let nextUrl = `${BITBUCKET_API_BASE}/repositories/${encodeURIComponent(username)}?pagelen=${BITBUCKET_PAGE_SIZE}`;
  let pageCount = 0;

  while (nextUrl && pageCount < MAX_REPOSITORY_LIST_PAGES) {
    pageCount += 1;
    const response = await fetch(nextUrl, {
      headers: { 'User-Agent': APP_USER_AGENT },
    });

    if (response.status === 404) {
      throw new Error(`Bitbucket user '${username}' not found.`);
    }

    if (!response.ok) {
      throw new Error(`Bitbucket API returned ${response.status}`);
    }

    const page: BitbucketPaginatedResponse<BitbucketRepository> =
      await response.json();

    repositories.push(...page.values);
    if (repositories.length >= MAX_REPOSITORIES) {
      return repositories.slice(0, MAX_REPOSITORIES);
    }

    nextUrl = page.next ?? '';
  }

  return repositories;
}

async function aggregateRepositoryCommits({
  user,
  repoSlug,
  fromMs,
  toExclusiveMs,
  counts,
}: {
  user: BitbucketUser;
  repoSlug: string;
  fromMs: number;
  toExclusiveMs: number;
  counts: Map<string, number>;
}) {
  let nextUrl = `${BITBUCKET_API_BASE}/repositories/${encodeURIComponent(user.workspace)}/${encodeURIComponent(repoSlug)}/commits?pagelen=${BITBUCKET_PAGE_SIZE}`;
  let pageCount = 0;

  while (nextUrl && pageCount < MAX_COMMIT_PAGES_PER_REPOSITORY) {
    pageCount += 1;
    const response = await fetch(nextUrl, {
      headers: { 'User-Agent': APP_USER_AGENT },
    });

    if (!response.ok) {
      if (response.status === 404) {
        break;
      }
      throw new Error(
        `Bitbucket commits API returned ${response.status} for ${repoSlug}`,
      );
    }

    const page: BitbucketPaginatedResponse<BitbucketCommit> =
      await response.json();

    let reachedOlderCommits = false;

    for (const commit of page.values) {
      const commitMs = Date.parse(commit.date);
      if (Number.isNaN(commitMs)) {
        continue;
      }

      if (commitMs < fromMs) {
        reachedOlderCommits = true;
        break;
      }

      if (commitMs >= toExclusiveMs) {
        continue;
      }

      if (!isCommitByUser(commit, user)) {
        continue;
      }

      const date = formatUtcDate(new Date(commitMs));
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }

    if (reachedOlderCommits) {
      break;
    }

    nextUrl = page.next ?? '';
  }
}

function isCommitByUser(commit: BitbucketCommit, user: BitbucketUser) {
  const commitUser = commit.author?.user;
  if (!commitUser) return false;

  // Primary: stable account_id match (works for modern Atlassian accounts
  // where username is deprecated)
  if (commitUser.account_id && commitUser.account_id === user.account_id) {
    return true;
  }

  // Fallback: nickname/username match for older accounts or unlinked commits
  const nicknameLower = user.nickname.toLowerCase();
  return [commitUser.username, commitUser.nickname]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase())
    .includes(nicknameLower);
}

function normalizeRequestedRange(
  request: NextRequest,
): { from: string; to: string } | { error: string } {
  return normalizeRequestedContributionRange(
    request.nextUrl.searchParams.get('from'),
    request.nextUrl.searchParams.get('to'),
    {
      rangeTooLargeError:
        'Bitbucket contribution lookups can span at most 1 year.',
    },
  );
}

function countToLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 7) return 2;
  if (count <= 15) return 3;
  return 4;
}
