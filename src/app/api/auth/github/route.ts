import { NextRequest, NextResponse } from 'next/server';
import {
  STATE_COOKIE_NAME,
  STATE_MAX_AGE_SECONDS,
  createOAuthState,
  hasGithubOAuthConfig,
} from '@/lib/auth-session';

export async function GET(request: NextRequest) {
  if (!hasGithubOAuthConfig()) {
    const url = new URL('/', request.nextUrl.origin);
    url.searchParams.set('auth_error', 'oauth_not_configured');
    return NextResponse.redirect(url);
  }

  const state = createOAuthState();
  const redirectUri = new URL('/api/auth/callback', request.nextUrl.origin);
  const authUrl = new URL('https://github.com/login/oauth/authorize');

  authUrl.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID!);
  authUrl.searchParams.set('redirect_uri', redirectUri.toString());
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', 'read:user');

  const response = NextResponse.redirect(authUrl);
  response.cookies.set({
    name: STATE_COOKIE_NAME,
    value: state,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STATE_MAX_AGE_SECONDS,
  });

  return response;
}
