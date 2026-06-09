import { NextRequest, NextResponse } from 'next/server';
import {
  STATE_MAX_AGE_SECONDS,
  createOAuthState,
  getStateCookieName,
} from '@/lib/auth-session';
import { getOAuthClientId, hasOAuthConfig } from '@/lib/oauth-providers';

export async function GET(request: NextRequest) {
  if (!hasOAuthConfig('gitlab')) {
    const url = new URL('/', request.nextUrl.origin);
    url.searchParams.set('auth_error', 'oauth_not_configured');
    return NextResponse.redirect(url);
  }

  const state = createOAuthState();
  const redirectUri = new URL(
    '/api/auth/callback/gitlab',
    request.nextUrl.origin,
  );
  const authUrl = new URL('https://gitlab.com/oauth/authorize');

  authUrl.searchParams.set('client_id', getOAuthClientId('gitlab')!);
  authUrl.searchParams.set('redirect_uri', redirectUri.toString());
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', 'read_user');
  authUrl.searchParams.set('response_type', 'code');

  const response = NextResponse.redirect(authUrl);
  response.cookies.set({
    name: getStateCookieName('gitlab'),
    value: state,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STATE_MAX_AGE_SECONDS,
  });

  return response;
}
