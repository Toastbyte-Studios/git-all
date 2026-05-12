import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthSessionFromRequest,
  hasGithubOAuthConfig,
} from '@/lib/auth-session';

export async function GET(request: NextRequest) {
  const session = getAuthSessionFromRequest(request);
  const oauthEnabled = hasGithubOAuthConfig();

  if (!session) {
    return NextResponse.json(
      { authenticated: false, oauthEnabled },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      oauthEnabled,
      user: {
        login: session.user.login,
        avatarUrl: session.user.avatarUrl,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
