import { NextRequest, NextResponse } from 'next/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics-events';
import { sendServerAnalyticsEvent } from '@/lib/analytics-server';
import { APP_USER_AGENT } from '@/lib/app-metadata';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  encodeAuthSession,
  encodeProviderToken,
  getAuthSessionFromRequest,
  getProviderTokenCookieName,
  getStateCookieName,
  mergeConnectionIntoSession,
} from '@/lib/auth-session';
import {
  getOAuthClientId,
  getOAuthClientSecret,
  hasOAuthConfig,
  OAUTH_PROVIDERS,
} from '@/lib/oauth-providers';
import type { ConnectionProvider } from '@/lib/types';

interface RouteContext {
  params: Promise<{
    provider: string;
  }>;
}

interface OAuthTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

function isConnectionProvider(value: string): value is ConnectionProvider {
  return value === 'github' || value === 'gitlab' || value === 'bitbucket';
}

function clearStateCookie(
  response: NextResponse,
  provider: ConnectionProvider,
) {
  response.cookies.set({
    name: getStateCookieName(provider),
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

function createErrorRedirect(
  request: NextRequest,
  provider: ConnectionProvider,
  code: string,
) {
  const url = new URL('/', request.nextUrl.origin);
  url.searchParams.set('auth_error', code);
  const response = NextResponse.redirect(url);
  clearStateCookie(response, provider);
  return response;
}

function createInvalidProviderRedirect(request: NextRequest) {
  const url = new URL('/', request.nextUrl.origin);
  url.searchParams.set('auth_error', 'invalid_provider');
  return NextResponse.redirect(url);
}

async function exchangeCodeForAccessToken(
  provider: ConnectionProvider,
  request: NextRequest,
  code: string,
  state: string,
) {
  const config = OAUTH_PROVIDERS[provider];
  const clientId = getOAuthClientId(provider);
  const clientSecret = getOAuthClientSecret(provider);

  if (!clientId || !clientSecret) {
    return null;
  }

  const redirectUri = new URL(
    `/api/auth/callback/${provider}`,
    request.nextUrl.origin,
  );
  const body = new URLSearchParams({
    code,
    redirect_uri: redirectUri.toString(),
    state,
    grant_type: 'authorization_code',
  });

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': APP_USER_AGENT,
  };

  if (config.tokenAuth === 'basic') {
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  } else {
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
  }

  const tokenResponse = await fetch(config.tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  });

  const tokenData = (await tokenResponse.json()) as OAuthTokenResponse;
  if (
    !tokenResponse.ok ||
    tokenData.error ||
    typeof tokenData.access_token !== 'string'
  ) {
    console.error(`${provider} OAuth token exchange failed`, {
      status: tokenResponse.status,
      error: tokenData.error ?? null,
      errorDescription: tokenData.error_description ?? null,
    });
    return null;
  }

  return tokenData.access_token;
}

async function fetchProviderIdentity(
  provider: ConnectionProvider,
  accessToken: string,
) {
  const config = OAUTH_PROVIDERS[provider];

  if (config.fetchIdentity) {
    return config.fetchIdentity(accessToken, APP_USER_AGENT);
  }

  const acceptHeader =
    provider === 'github' ? 'application/vnd.github+json' : 'application/json';

  const userResponse = await fetch(config.userUrl, {
    headers: {
      Authorization: 'Bearer ' + accessToken,
      Accept: acceptHeader,
      'User-Agent': APP_USER_AGENT,
    },
  });

  if (!userResponse.ok) {
    return null;
  }

  return config.parseIdentity(await userResponse.json());
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { provider: providerParam } = await context.params;
  if (!isConnectionProvider(providerParam)) {
    return createInvalidProviderRedirect(request);
  }

  if (!hasOAuthConfig(providerParam)) {
    return createErrorRedirect(request, providerParam, 'oauth_not_configured');
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get(
    getStateCookieName(providerParam),
  )?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return createErrorRedirect(request, providerParam, 'invalid_state');
  }

  try {
    const accessToken = await exchangeCodeForAccessToken(
      providerParam,
      request,
      code,
      state,
    );
    if (!accessToken) {
      return createErrorRedirect(
        request,
        providerParam,
        'token_exchange_failed',
      );
    }

    const identity = await fetchProviderIdentity(providerParam, accessToken);
    if (!identity) {
      return createErrorRedirect(request, providerParam, 'user_fetch_failed');
    }

    const existingSession = await getAuthSessionFromRequest(request);
    const mergedSession = mergeConnectionIntoSession(existingSession, {
      provider: providerParam,
      accountId: identity.accountId,
      username: identity.username,
      avatarUrl: identity.avatarUrl,
      verifiedAt: Date.now(),
    });
    const serializedSession = await encodeAuthSession(mergedSession);

    if (!serializedSession) {
      return createErrorRedirect(
        request,
        providerParam,
        'session_create_failed',
      );
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

    // Store the access token in its own per-provider cookie to keep the main
    // session cookie small (Bitbucket tokens are large enough to push a
    // multi-account session past the 4096-byte browser limit).
    const serializedToken = await encodeProviderToken(accessToken);
    if (serializedToken) {
      response.cookies.set({
        name: getProviderTokenCookieName(providerParam),
        value: serializedToken,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS,
      });
    }

    clearStateCookie(response, providerParam);

    const hadProviderConnection = Boolean(
      existingSession?.connections[providerParam],
    );
    const existingConnectionCount = Object.keys(
      existingSession?.connections ?? {},
    ).length;
    const mergedConnectionCount = Object.keys(mergedSession.connections).length;
    const primaryEvent =
      existingConnectionCount > 0 && !hadProviderConnection
        ? ANALYTICS_EVENTS.connectProvider
        : ANALYTICS_EVENTS.signIn;

    void sendServerAnalyticsEvent(request, primaryEvent, {
      provider: providerParam,
      connection_count: mergedConnectionCount,
    });
    if (!hadProviderConnection && mergedConnectionCount >= 2) {
      void sendServerAnalyticsEvent(
        request,
        ANALYTICS_EVENTS.multiAccountConnected,
        {
          provider: providerParam,
          connection_count: mergedConnectionCount,
        },
      );
    }

    return response;
  } catch (error) {
    console.error(`${providerParam} OAuth callback failed unexpectedly`, error);
    return createErrorRedirect(request, providerParam, 'oauth_callback_failed');
  }
}
