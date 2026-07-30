import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth-cookies';

function logoutResponse(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.nextUrl.origin));
  clearAuthCookies(response);
  return response;
}

export async function POST(request: NextRequest) {
  return logoutResponse(request);
}
