import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, STATE_COOKIE_NAME } from '@/lib/auth-session';

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

function logoutResponse(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.nextUrl.origin));
  clearAuthCookies(response);
  return response;
}

export async function GET(request: NextRequest) {
  return logoutResponse(request);
}

export async function POST(request: NextRequest) {
  return logoutResponse(request);
}
