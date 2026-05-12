import { NextRequest, NextResponse } from 'next/server';
import { APP_USER_AGENT } from '@/lib/app-metadata';

const DEFAULT_GITLAB_URL = 'https://gitlab.com';

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get('username');
  if (!username) {
    return NextResponse.json(
      { error: 'Missing username parameter' },
      { status: 400 },
    );
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

    // Build full 365-day calendar
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const calendar: Array<{ date: string; count: number; level: number }> = [];
    const cursor = new Date(oneYearAgo);

    while (cursor <= now) {
      const dateStr = cursor.toISOString().split('T')[0];
      const count = calendarData[dateStr] ?? 0;
      calendar.push({
        date: dateStr,
        count,
        level: countToLevel(count),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const totalContributions = calendar.reduce((sum, d) => sum + d.count, 0);

    return NextResponse.json({
      platform: 'gitlab',
      username,
      totalContributions,
      dateRange: {
        from: calendar[0]?.date ?? null,
        to: calendar[calendar.length - 1]?.date ?? null,
      },
      calendar,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function countToLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 7) return 2;
  if (count <= 15) return 3;
  return 4;
}
