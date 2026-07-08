import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  getProviderTokenCookieName,
  getStateCookieName,
} from '@/lib/auth-session';
import { CONNECTION_PROVIDERS } from '@/lib/oauth-providers';

function clearAuthCookies(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  for (const provider of CONNECTION_PROVIDERS) {
    response.cookies.set({
      name: getStateCookieName(provider),
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
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
}

function logoutResponse(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.nextUrl.origin));
  clearAuthCookies(response);
  return response;
}

export async function POST(request: NextRequest) {
  return logoutResponse(request);
}
