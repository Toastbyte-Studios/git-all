import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import {
  HANDLE_CHANGE_COOLDOWN_MS,
  isHandleAvailable,
  isValidHandleFormat,
  setHandle,
} from '@/lib/profiles';

/**
 * GET /api/profile/handle?candidate=<handle>
 * Returns `{ available: boolean, valid: boolean }`.
 */
export async function GET(request: NextRequest) {
  const candidate = request.nextUrl.searchParams.get('candidate') ?? '';
  const valid = isValidHandleFormat(candidate);

  if (!valid) {
    return NextResponse.json({ available: false, valid: false });
  }

  const available = await isHandleAvailable(candidate);
  return NextResponse.json({ available, valid: true });
}

/**
 * POST /api/profile/handle
 * Body: `{ handle: string }`
 *
 * Requires an authenticated session with a `userId`.
 *
 * Returns:
 * - 200 `{ ok: true }`
 * - 400 `{ error: 'invalid_handle' }`
 * - 401 `{ error: 'unauthenticated' }`
 * - 409 `{ error: 'handle_taken' }`
 * - 429 `{ error: 'cooldown', nextAllowedAt: number }`
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
    typeof (body as Record<string, unknown>).handle !== 'string'
  ) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const newHandle = ((body as Record<string, unknown>).handle as string).trim();
  const result = await setHandle(session.userId, newHandle);

  if (result.ok) {
    return NextResponse.json({ ok: true });
  }

  switch (result.reason) {
    case 'invalid':
      return NextResponse.json({ error: 'invalid_handle' }, { status: 400 });
    case 'taken':
      return NextResponse.json({ error: 'handle_taken' }, { status: 409 });
    case 'cooldown':
      return NextResponse.json(
        {
          error: 'cooldown',
          nextAllowedAt: result.nextAllowedAt,
          cooldownMs: HANDLE_CHANGE_COOLDOWN_MS,
        },
        { status: 429 },
      );
    case 'no_db':
      return NextResponse.json({ error: 'db_unavailable' }, { status: 503 });
  }
}
