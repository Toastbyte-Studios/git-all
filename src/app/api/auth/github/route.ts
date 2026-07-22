import { NextRequest, NextResponse } from 'next/server';
import {
  STATE_MAX_AGE_SECONDS,
  createOAuthState,
  getReturnToCookieName,
  getStateCookieName,
} from '@/lib/auth-session';
import {
  getOAuthClientId,
  hasOAuthConfig,
  OAUTH_PROVIDERS,
} from '@/lib/oauth-providers';

export async function GET(request: NextRequest) {
  if (!hasOAuthConfig('github')) {
    const url = new URL('/', request.nextUrl.origin);
    url.searchParams.set('auth_error', 'oauth_not_configured');
    return NextResponse.redirect(url);
  }

  const state = createOAuthState();
  const config = OAUTH_PROVIDERS.github;
  const redirectUri = new URL(
    '/api/auth/callback/github',
    request.nextUrl.origin,
  );
  const authUrl = new URL(config.authorizeUrl);

  authUrl.searchParams.set('client_id', getOAuthClientId('github')!);
  authUrl.searchParams.set('redirect_uri', redirectUri.toString());
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', config.scope);
  authUrl.searchParams.set('response_type', 'code');

  const response = NextResponse.redirect(authUrl);
  response.cookies.set({
    name: getStateCookieName('github'),
    value: state,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STATE_MAX_AGE_SECONDS,
  });

  const returnTo = request.nextUrl.searchParams.get('returnTo');
  if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    response.cookies.set({
      name: getReturnToCookieName('github'),
      value: returnTo,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: STATE_MAX_AGE_SECONDS,
    });
  }

  return response;
}
