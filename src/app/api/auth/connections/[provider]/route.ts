import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  encodeAuthSession,
  getAuthSessionFromRequest,
  removeConnectionFromSession,
} from '@/lib/auth-session';
import type { ConnectionProvider } from '@/lib/types';

interface RouteContext {
  params: Promise<{
    provider: string;
  }>;
}

function isConnectionProvider(value: string): value is ConnectionProvider {
  return value === 'github' || value === 'gitlab' || value === 'bitbucket';
}

function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { provider } = await context.params;
  if (!isConnectionProvider(provider)) {
    return NextResponse.json(
      { error: 'Invalid provider' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const session = await getAuthSessionFromRequest(request);
  if (!session?.connections[provider]) {
    return NextResponse.json(
      { error: 'Connection not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const nextSession = removeConnectionFromSession(session, provider);
  if (!nextSession) {
    const response = NextResponse.json(
      { authenticated: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    clearSessionCookie(response);
    return response;
  }

  const serializedSession = await encodeAuthSession(nextSession);
  if (!serializedSession) {
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const response = NextResponse.json(
    {
      authenticated: true,
      primary: nextSession.primary,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: serializedSession,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
