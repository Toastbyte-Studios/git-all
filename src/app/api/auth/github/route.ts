import { NextRequest, NextResponse } from 'next/server';
import {
  STATE_COOKIE_NAME,
  STATE_MAX_AGE_SECONDS,
  createOAuthState,
  hasGithubOAuthConfig,
} from '@/lib/auth-session';

export async function GET(request: NextRequest) {
  if (!hasGithubOAuthConfig()) {
    return NextResponse.json(
      {
        error:
          'Server misconfiguration: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required.',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
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
