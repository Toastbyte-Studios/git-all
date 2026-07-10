import dns from 'node:dns/promises';
import net from 'node:net';
import { NextRequest, NextResponse } from 'next/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics-events';
import { sendServerAnalyticsEvent } from '@/lib/analytics-server';
import { APP_USER_AGENT } from '@/lib/app-metadata';
import {
  formatUtcDate,
  normalizeRequestedContributionRange,
  parseDateInput,
} from '@/lib/contribution-period';
import { DEFAULT_GITEA_INSTANCE_URL, normalizeInstanceUrl } from '@/lib/gitea';

interface GiteaHeatmapEntry {
  timestamp: number;
  contributions: number;
}

const UPSTREAM_TIMEOUT_MS = 8_000;
const MAX_UPSTREAM_JSON_BYTES = 512 * 1024;

function countToLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 7) return 2;
  if (count <= 15) return 3;
  return 4;
}

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get('username')?.trim();
  if (!username) {
    return NextResponse.json(
      { error: 'Missing username parameter' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const requestedRange = normalizeRequestedRange(request);
  if ('error' in requestedRange) {
    return NextResponse.json(
      { error: requestedRange.error },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const rawInstanceUrl =
    request.nextUrl.searchParams.get('instanceUrl') ??
    DEFAULT_GITEA_INSTANCE_URL;
  const normalizedInstanceUrl = normalizeInstanceUrl(rawInstanceUrl);
  if (!normalizedInstanceUrl) {
    return NextResponse.json(
      { error: 'Invalid Gitea / Forgejo instance URL.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const ssrfError = await validateInstanceUrl(normalizedInstanceUrl);
  if (ssrfError) {
    return NextResponse.json(
      { error: ssrfError },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const encodedUser = encodeURIComponent(username);
    const userResponse = await fetch(
      `${normalizedInstanceUrl}/api/v1/users/${encodedUser}`,
      {
        headers: { 'User-Agent': APP_USER_AGENT },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    );

    if (userResponse.status === 404) {
      return NextResponse.json(
        { error: `Gitea/Forgejo user '${username}' not found.` },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (!userResponse.ok) {
      throw new Error(`Gitea user API returned ${userResponse.status}`);
    }

    const heatmapResponse = await fetch(
      `${normalizedInstanceUrl}/api/v1/users/${encodedUser}/heatmap`,
      {
        headers: { 'User-Agent': APP_USER_AGENT },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    );

    if (!heatmapResponse.ok) {
      throw new Error(`Gitea heatmap API returned ${heatmapResponse.status}`);
    }

    const heatmap = await parseLimitedJson<GiteaHeatmapEntry[]>(
      heatmapResponse,
      MAX_UPSTREAM_JSON_BYTES,
    );
    const contributionMap = new Map<string, number>();

    for (const item of heatmap) {
      const date = toUtcDateFromUnixTimestamp(item.timestamp);
      if (!date) continue;
      if (date < requestedRange.from || date > requestedRange.to) continue;
      contributionMap.set(
        date,
        (contributionMap.get(date) ?? 0) + item.contributions,
      );
    }

    const fromDate = parseDateInput(requestedRange.from);
    const toDate = parseDateInput(requestedRange.to);
    if (!fromDate || !toDate) {
      return NextResponse.json(
        { error: 'Invalid contribution date range.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const calendar: Array<{ date: string; count: number; level: number }> = [];
    const cursor = new Date(fromDate.getTime());
    while (cursor <= toDate) {
      const date = formatUtcDate(cursor);
      const count = contributionMap.get(date) ?? 0;
      calendar.push({ date, count, level: countToLevel(count) });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const totalContributions = calendar.reduce(
      (sum, day) => sum + day.count,
      0,
    );

    const payload = {
      platform: 'gitea',
      username,
      instanceUrl: normalizedInstanceUrl,
      totalContributions,
      dateRange: {
        from: calendar[0]?.date ?? null,
        to: calendar[calendar.length - 1]?.date ?? null,
      },
      calendar,
    };
    void sendServerAnalyticsEvent(request, ANALYTICS_EVENTS.lookupSuccess, {
      provider: 'gitea',
      total_contributions: totalContributions,
    });
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'Gitea/Forgejo request timed out.' },
        { status: 504, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

async function parseLimitedJson<T>(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Upstream response body was empty.');
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      throw new Error('Upstream response exceeded size limit.');
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const text = new TextDecoder().decode(merged);
  return JSON.parse(text) as T;
}

function normalizeRequestedRange(
  request: NextRequest,
): { from: string; to: string } | { error: string } {
  return normalizeRequestedContributionRange(
    request.nextUrl.searchParams.get('from'),
    request.nextUrl.searchParams.get('to'),
    {
      rangeTooLargeError: 'Gitea contribution lookups can span at most 1 year.',
    },
  );
}

function toUtcDateFromUnixTimestamp(timestamp: number) {
  const ms = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return formatUtcDate(date);
}

async function validateInstanceUrl(instanceUrl: string) {
  const parsed = new URL(instanceUrl);

  if (parsed.username || parsed.password) {
    return 'Instance URL must not include credentials.';
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'Instance URL must use http or https.';
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return 'Local instance URLs are not allowed.';
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrLoopbackIp(hostname)) {
      return 'Private or loopback instance URLs are not allowed.';
    }
    return null;
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (
      addresses.length === 0 ||
      addresses.some((entry) => isPrivateOrLoopbackIp(entry.address))
    ) {
      return 'Private or loopback instance URLs are not allowed.';
    }
  } catch {
    return 'Could not resolve instance URL host.';
  }

  return null;
}

function isPrivateOrLoopbackIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized === '::' ||
      normalized.startsWith('::ffff:127.')
    );
  }

  return true;
}
