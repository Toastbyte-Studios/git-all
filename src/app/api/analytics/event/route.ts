import { NextRequest, NextResponse } from 'next/server';
import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
} from '@/lib/analytics-events';
import { sendServerAnalyticsEvent } from '@/lib/analytics-server';

const ALLOWED_EVENTS = new Set<AnalyticsEventName>(
  Object.values(ANALYTICS_EVENTS),
);

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
