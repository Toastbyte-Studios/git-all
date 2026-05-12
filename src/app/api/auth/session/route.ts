import { NextRequest, NextResponse } from 'next/server';
import { getAuthSessionFromRequest } from '@/lib/auth-session';

export async function GET(request: NextRequest) {
  const session = getAuthSessionFromRequest(request);

  if (!session) {
    return NextResponse.json(
      { authenticated: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      user: {
        login: session.user.login,
        avatarUrl: session.user.avatarUrl,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
