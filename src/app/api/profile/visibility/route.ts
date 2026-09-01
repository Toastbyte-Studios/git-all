import { NextRequest, NextResponse } from 'next/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics-events';
import { trackServerEvent } from '@/lib/analytics-server';
import { getAuthSession } from '@/lib/auth-session';
import { setVisibility } from '@/lib/profiles';

/**
 * POST /api/profile/visibility
 * Body: `{ isPublic: boolean }`
 *
 * Requires an authenticated session with a `userId`. Publishing is always an
 * explicit user action — there is no path that flips this on implicitly.
 *
 * Returns:
 * - 200 `{ ok: true, isPublic: boolean }`
 * - 400 `{ error: 'invalid_body' }`
 * - 401 `{ error: 'unauthenticated' }`
 * - 503 `{ error: 'db_unavailable' }` — plain next dev without D1
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== 'object' ||
    typeof (body as Record<string, unknown>).isPublic !== 'boolean'
  ) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const isPublic = (body as Record<string, unknown>).isPublic as boolean;
  const ok = await setVisibility(session.userId, isPublic);

  if (!ok) {
    return NextResponse.json({ error: 'db_unavailable' }, { status: 503 });
  }

  // Fired after the write succeeds, never before, so the count cannot drift
  // from the database. Publishing and unpublishing are separate event names
  // rather than one event with a boolean param: the param sanitiser in
  // analytics-server.ts coerces booleans to 1/0, which is awkward to segment
  // on in GA4. No handle is sent — this says that a profile changed state,
  // not whose.
  trackServerEvent(
    request,
    isPublic
      ? ANALYTICS_EVENTS.profilePublished
      : ANALYTICS_EVENTS.profileUnpublished,
  );

  return NextResponse.json({ ok: true, isPublic });
}
