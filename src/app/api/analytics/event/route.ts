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

  await sendServerAnalyticsEvent(
    request,
    body.eventName as AnalyticsEventName,
    body.params ?? {},
  );

  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
