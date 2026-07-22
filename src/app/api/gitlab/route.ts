import { NextRequest, NextResponse } from 'next/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics-events';
import { trackServerEvent } from '@/lib/analytics-server';
import { APP_USER_AGENT } from '@/lib/app-metadata';
import {
  DEFAULT_CONTRIBUTION_PERIOD,
  formatUtcDate,
  getContributionDateRange,
  getTodayUtc,
  normalizeRequestedContributionRange,
  parseDateInput,
} from '@/lib/contribution-period';

const DEFAULT_GITLAB_URL = 'https://gitlab.com';

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get('username');
  if (!username) {
    return NextResponse.json(
      { error: 'Missing username parameter' },
      { status: 400 },
    );
  }

  const requestedRange = normalizeRequestedRange(request);
  if ('error' in requestedRange) {
    return NextResponse.json({ error: requestedRange.error }, { status: 400 });
  }

  const baseUrl = DEFAULT_GITLAB_URL;

  try {
    // GitLab exposes the contribution calendar at /users/:username/calendar.json
    // This is a semi-private endpoint (not under /api/v4/) but is the same one
    // the GitLab profile UI uses. No authentication required for public profiles.
    const calendarResponse = await fetch(
      `${baseUrl}/users/${encodeURIComponent(username)}/calendar.json`,
      { headers: { 'User-Agent': APP_USER_AGENT } },
    );

    if (calendarResponse.status === 404) {
      return NextResponse.json(
        { error: `GitLab user '${username}' not found.` },
        { status: 404 },
      );
    }

    if (!calendarResponse.ok) {
      throw new Error(
        `GitLab calendar API returned ${calendarResponse.status}`,
      );
    }

    const calendarData: Record<string, number> = await calendarResponse.json();

    const availableRange = getContributionDateRange(
      DEFAULT_CONTRIBUTION_PERIOD,
      getTodayUtc(),
    );
    const effectiveRange = intersectRanges(requestedRange, availableRange);

    const calendar: Array<{ date: string; count: number; level: number }> = [];
    if (effectiveRange) {
      const cursor = parseDateInput(effectiveRange.from);
      const end = parseDateInput(effectiveRange.to);

      if (!cursor || !end) {
        throw new Error('Invalid effective GitLab date range.');
      }

      while (cursor <= end) {
        const dateStr = formatUtcDate(cursor);
        const count = calendarData[dateStr] ?? 0;
        calendar.push({
          date: dateStr,
          count,
          level: countToLevel(count),
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    const totalContributions = calendar.reduce((sum, d) => sum + d.count, 0);

    // dateRange reflects the actual slice returned to the client after
    // intersecting the requested range with GitLab's trailing-year calendar.
    // The UI uses it to show when older requested dates were truncated.
    const payload = {
      platform: 'gitlab',
      username,
      totalContributions,
      dateRange: {
        from: calendar[0]?.date ?? null,
        to: calendar[calendar.length - 1]?.date ?? null,
      },
      calendar,
    };
    trackServerEvent(request, ANALYTICS_EVENTS.lookupSuccess, {
      provider: 'gitlab',
      total_contributions: totalContributions,
    });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeRequestedRange(request: NextRequest):
  | { from: string; to: string }
  | {
      error: string;
    } {
  return normalizeRequestedContributionRange(
    request.nextUrl.searchParams.get('from'),
    request.nextUrl.searchParams.get('to'),
    {
      rangeTooLargeError: 'Contribution lookups can span at most 1 year.',
    },
  );
}

function intersectRanges(
  requestedRange: { from: string; to: string },
  availableRange: { from: string; to: string },
) {
  const start =
    requestedRange.from > availableRange.from
      ? requestedRange.from
      : availableRange.from;
  const end =
    requestedRange.to < availableRange.to
      ? requestedRange.to
      : availableRange.to;

  return start <= end ? { from: start, to: end } : null;
}

function countToLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 7) return 2;
  if (count <= 15) return 3;
  return 4;
}
