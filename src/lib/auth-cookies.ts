import {
  SESSION_COOKIE_NAME,
  getProviderTokenCookieName,
  getStateCookieName,
} from '@/lib/auth-session';
import { CONNECTION_PROVIDERS } from '@/lib/oauth-providers';
import type { NextResponse } from 'next/server';

/**
 * Expires every auth cookie this app sets: the session cookie, and the OAuth
 * state and access-token cookies for every provider.
 *
 * Shared by `/api/auth/logout` and account deletion. Deletion in particular
 * must clear the per-provider token cookies as well as the session — leaving a
 * live `gitall_token_*` cookie behind after someone has asked us to erase their
 * account would keep a usable provider credential in their browser.
 */
export function clearAuthCookies(response: NextResponse): void {
  const expired = {
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  } as const;

  response.cookies.set({ name: SESSION_COOKIE_NAME, ...expired });

  for (const provider of CONNECTION_PROVIDERS) {
    response.cookies.set({ name: getStateCookieName(provider), ...expired });
    response.cookies.set({
      name: getProviderTokenCookieName(provider),
      ...expired,
    });
  }
}
