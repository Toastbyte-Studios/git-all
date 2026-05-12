import { NextRequest, NextResponse } from 'next/server';
import { APP_USER_AGENT } from '@/lib/app-metadata';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  STATE_COOKIE_NAME,
  encodeAuthSession,
  hasGithubOAuthConfig,
} from '@/lib/auth-session';

function clearStateCookie(response: NextResponse) {
  response.cookies.set({
    name: STATE_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

function createErrorRedirect(request: NextRequest, code: string) {
  const url = new URL('/', request.nextUrl.origin);
  url.searchParams.set('auth_error', code);
  const response = NextResponse.redirect(url);
  clearStateCookie(response);
  return response;
}

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

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get(STATE_COOKIE_NAME)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return createErrorRedirect(request, 'invalid_state');
  }

  try {
    const redirectUri = new URL('/api/auth/callback', request.nextUrl.origin);

    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': APP_USER_AGENT,
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri.toString(),
          state,
        }),
      },
    );

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
      console.error('GitHub OAuth token exchange failed', {
        status: tokenResponse.status,
        error: tokenData.error ?? null,
        errorDescription: tokenData.error_description ?? null,
      });
      return createErrorRedirect(request, 'token_exchange_failed');
    }

    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': APP_USER_AGENT,
      },
    });

    if (!userResponse.ok) {
      return createErrorRedirect(request, 'user_fetch_failed');
    }

    const userData = await userResponse.json();
    if (!userData?.login || !userData?.avatar_url) {
      return createErrorRedirect(request, 'invalid_user_data');
    }

    const serializedSession = encodeAuthSession({
      accessToken: tokenData.access_token,
      user: {
        login: userData.login,
        avatarUrl: userData.avatar_url,
      },
    });

    if (!serializedSession) {
      return createErrorRedirect(request, 'session_create_failed');
    }

    const response = NextResponse.redirect(
      new URL('/', request.nextUrl.origin),
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
    clearStateCookie(response);

    return response;
  } catch (error) {
    console.error('GitHub OAuth callback failed unexpectedly', error);
    return createErrorRedirect(request, 'oauth_callback_failed');
  }
}
