import { NextRequest, NextResponse } from 'next/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics-events';
import { trackServerEvent } from '@/lib/analytics-server';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  encodeAuthSession,
  getAuthSessionFromRequest,
  getProviderTokenCookieName,
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

function clearProviderTokenCookie(
  response: NextResponse,
  provider: ConnectionProvider,
) {
  response.cookies.set({
    name: getProviderTokenCookieName(provider),
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

  // The provider name is an enum of three values and says nothing about who
  // the user is. `was_last` distinguishes trimming one account from leaving
  // entirely — the second is the one worth noticing, and it is invisible if
  // both cases share an event.
  if (!nextSession) {
    trackServerEvent(request, ANALYTICS_EVENTS.providerDisconnected, {
      provider,
      was_last: true,
      remaining_connections: 0,
    });

    const response = NextResponse.json(
      { authenticated: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    clearSessionCookie(response);
    clearProviderTokenCookie(response, provider);
    return response;
  }

  const serializedSession = await encodeAuthSession(nextSession);
  if (!serializedSession) {
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  trackServerEvent(request, ANALYTICS_EVENTS.providerDisconnected, {
    provider,
    was_last: false,
    remaining_connections: Object.values(nextSession.connections).filter(Boolean)
      .length,
  });

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
  clearProviderTokenCookie(response, provider);
  return response;
}
