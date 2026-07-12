import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
} from '@/lib/analytics-events';
import { sendServerAnalyticsEvent } from '@/lib/analytics-server';

const ALLOWED_EVENTS = new Set<AnalyticsEventName>(
  Object.values(ANALYTICS_EVENTS),
);

// Rate limiting: sliding window per hashed client IP.
// This cache is intentionally per-instance (not shared across Workers).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const MAX_RATE_LIMIT_ENTRIES = 10_000;

const rateLimitMap = new Map<string, number[]>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0]?.trim() || 'unknown';
}

function checkRateLimit(request: NextRequest): boolean {
  const ip = getClientIp(request);
  const key = createHash('sha256').update(ip).digest('hex').slice(0, 16);
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Evict excess entries when the map grows too large.
  if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
    for (const [k, timestamps] of rateLimitMap.entries()) {
      const kept = timestamps.filter((t) => t > windowStart);
      if (kept.length === 0) {
        rateLimitMap.delete(k);
      } else {
        rateLimitMap.set(k, kept);
      }
    }
  }

  const timestamps = rateLimitMap.get(key) ?? [];
  const recent = timestamps.filter((t) => t > windowStart);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitMap.set(key, recent);
    return false;
  }

  recent.push(now);
  rateLimitMap.set(key, recent);
  return true;
}

/** Clears rate-limit state. Exposed for unit tests only. */
export function _resetRateLimitForTest() {
  rateLimitMap.clear();
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json.' },
      { status: 415 },
    );
  }

  const origin = request.headers.get('origin');
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origin not allowed.' }, { status: 403 });
  }

  if (!checkRateLimit(request)) {
    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    eventName?: string;
    params?: Record<string, string | number | boolean | null | undefined>;
  } | null;

  if (
    !body?.eventName ||
    !ALLOWED_EVENTS.has(body.eventName as AnalyticsEventName)
  ) {
    return NextResponse.json(
      { error: 'Invalid analytics event name.' },
      { status: 400 },
    );
  }

  const rawParams = body.params ?? {};
  const primitiveParams: Record<
    string,
    string | number | boolean | null | undefined
  > = Object.fromEntries(
    Object.entries(rawParams).filter(
      ([, v]) =>
        v === null ||
        v === undefined ||
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean',
    ),
  );

  await sendServerAnalyticsEvent(
    request,
    body.eventName as AnalyticsEventName,
    primitiveParams,
  );

  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
