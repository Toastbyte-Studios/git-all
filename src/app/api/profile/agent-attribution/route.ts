import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { setShowAgentAttribution } from '@/lib/profiles';

/**
 * POST /api/profile/agent-attribution
 * Body: `{ showAgentAttribution: boolean }`
 *
 * Requires an authenticated session with a `userId`. Controls whether
 * visitors to the public profile see agent-attributed commits; the owner
 * always sees their own. Off by default, and only ever turned on by this
 * explicit action.
 *
 * Returns:
 * - 200 `{ ok: true, showAgentAttribution: boolean }`
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

  const value =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>).showAgentAttribution
      : undefined;
  if (typeof value !== 'boolean') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const ok = await setShowAgentAttribution(session.userId, value);
  if (!ok) {
    return NextResponse.json({ error: 'db_unavailable' }, { status: 503 });
  }

  return NextResponse.json({ ok: true, showAgentAttribution: value });
}
