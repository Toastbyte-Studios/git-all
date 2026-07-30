import { NextRequest, NextResponse } from 'next/server';
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

  return NextResponse.json({ ok: true, isPublic });
}
