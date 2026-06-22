import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth-session';
import { getAvailableOAuthProviders } from '@/lib/oauth-providers';
import type { Connection, ConnectionProvider } from '@/lib/types';
import { MeClient } from './MeClient';

/** Serialised session data sent to the client component (access tokens excluded). */
export interface ClientConnection {
  provider: ConnectionProvider;
  accountId: string;
  username: string;
  avatarUrl: string;
  verifiedAt: number;
}

export interface ClientSession {
  primary: ConnectionProvider;
  connections: Partial<Record<ConnectionProvider, ClientConnection>>;
  availableProviders: ConnectionProvider[];
}

function sanitizeConnection(connection: Connection): ClientConnection {
  return {
    provider: connection.provider,
    accountId: connection.accountId,
    username: connection.username,
    avatarUrl: connection.avatarUrl,
    verifiedAt: connection.verifiedAt,
  };
}

export default async function MePage() {
  const session = await getAuthSession();

  if (!session || Object.keys(session.connections).length === 0) {
    redirect('/?signin=required');
    // next/navigation redirect() never returns in production; the explicit
    // return keeps TypeScript happy and prevents test environments (where
    // redirect is mocked) from executing the code below.
    return null;
  }

  const sanitizedConnections: Partial<
    Record<ConnectionProvider, ClientConnection>
  > = {};
  for (const [provider, connection] of Object.entries(session.connections)) {
    if (connection) {
      sanitizedConnections[provider as ConnectionProvider] =
        sanitizeConnection(connection);
    }
  }

  const clientSession: ClientSession = {
    primary: session.primary,
    connections: sanitizedConnections,
    availableProviders: getAvailableOAuthProviders(),
  };

  return <MeClient session={clientSession} />;
}
