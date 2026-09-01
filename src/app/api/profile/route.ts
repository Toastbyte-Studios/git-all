import { NextRequest, NextResponse } from 'next/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics-events';
import { trackServerEvent } from '@/lib/analytics-server';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { getAuthSession } from '@/lib/auth-session';
import { deleteUser, getHandleByUserId } from '@/lib/profiles';

/**
 * DELETE /api/profile
 * Body: `{ handle: string }` — must match the caller's current handle.
 *
 * Deletes the authenticated user's `users` row and every `connections` row
 * belonging to them, then expires the session cookie and all per-provider
 * token cookies.
 *
 * The handle in the body is a confirmation, not authorisation — authorisation
 * comes from the session. It exists so that an erasure this destructive cannot
 * be triggered by a bare request that happens to carry the user's cookies; the
 * caller has to know and restate which account they are deleting. The UI
 * collects it by making the user type their handle.
 *
 * Signing in again afterwards creates a fresh user row with a re-derived
 * handle, which may now be taken and pick up a `-2` suffix. There is
 * deliberately no tombstone table reserving released handles — that is
 * over-engineering at this stage, and its absence is a decision rather than an
 * oversight.
 *
 * Returns:
 * - 200 `{ ok: true }` — cookies cleared; the client should navigate to `/`
 * - 400 `{ error: 'invalid_body' }`
 * - 401 `{ error: 'unauthenticated' }`
 * - 409 `{ error: 'handle_mismatch' }`
 * - 503 `{ error: 'db_unavailable' }` — plain next dev without D1
 */
export async function DELETE(request: NextRequest) {
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
    typeof (body as Record<string, unknown>).handle !== 'string'
  ) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const confirmation = (
    (body as Record<string, unknown>).handle as string
  ).trim();

  const currentHandle = await getHandleByUserId(session.userId);
  if (currentHandle === null) {
    return NextResponse.json({ error: 'db_unavailable' }, { status: 503 });
  }

  if (confirmation !== currentHandle) {
    return NextResponse.json({ error: 'handle_mismatch' }, { status: 409 });
  }

  const deleted = await deleteUser(session.userId);
  if (!deleted) {
    return NextResponse.json({ error: 'db_unavailable' }, { status: 503 });
  }

  // Deliberately parameterless. The obviously interesting details here —
  // which handle, how long the account lived, how many connections it had —
  // are all either identifying or one query away from being so, and this is
  // the one request in the app where the user is asking us to forget them.
  // A bare count of deletions is the most we should take from it.
  //
  // Fired before the response is built so it is not lost if cookie clearing
  // throws. trackServerEvent registers delivery with waitUntil and returns
  // immediately, so this does not delay the response.
  trackServerEvent(request, ANALYTICS_EVENTS.accountDeleted);

  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
