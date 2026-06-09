import { NextRequest, NextResponse } from 'next/server';
import { getAuthSessionFromRequest } from '@/lib/auth-session';
import { getAvailableOAuthProviders } from '@/lib/oauth-providers';

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

  return NextResponse.json(
    {
      authenticated: true,
      availableProviders,
      primary: session.primary,
      connections,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
