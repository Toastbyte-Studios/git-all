import { NextRequest, NextResponse } from 'next/server';
import { getAuthSessionFromRequest } from '@/lib/auth-session';
import { getAvailableOAuthProviders } from '@/lib/oauth-providers';
import { getProfileSummaryByUserId } from '@/lib/profiles';

export async function GET(request: NextRequest) {
  const session = await getAuthSessionFromRequest(request);
  const availableProviders = getAvailableOAuthProviders();

  if (!session) {
    return NextResponse.json(
      { authenticated: false, availableProviders },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const connections = Object.fromEntries(
    Object.entries(session.connections)
      .filter(([, connection]) => connection !== undefined)
      .map(([provider, connection]) => [
        provider,
        {
          provider: connection!.provider,
          accountId: connection!.accountId,
          username: connection!.username,
          avatarUrl: connection!.avatarUrl,
          verifiedAt: connection!.verifiedAt,
        },
      ]),
  );

  let profile = null;
  if (session.userId) {
    try {
      profile = await getProfileSummaryByUserId(session.userId);
    } catch {
      profile = null;
    }
  }

  return NextResponse.json(
    {
      authenticated: true,
      availableProviders,
      primary: session.primary,
      connections,
      profile,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
