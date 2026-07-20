import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth-session';
import { getAvailableOAuthProviders } from '@/lib/oauth-providers';
import { getHandleByUserId } from '@/lib/profiles';
import type { Connection, ConnectionProvider } from '@/lib/types';
import { WhoAmIClient } from './WhoAmIClient';

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
  /** Public profile handle, or null if not yet set. */
  handle: string | null;
  /** D1 user id, used to authorise handle changes. */
  userId: string | null;
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

export default async function WhoAmIPage() {
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

  // Attempt to load the user's profile handle from D1 (non-fatal).
  let handle: string | null = null;
  try {
    if (session.userId) {
      handle = await getHandleByUserId(session.userId);
    }
  } catch {
    // DB unavailable in plain next dev — handle stays null
  }

  const clientSession: ClientSession = {
    primary: session.primary,
    connections: sanitizedConnections,
    availableProviders: getAvailableOAuthProviders(),
    handle,
    userId: session.userId ?? null,
  };

  return <WhoAmIClient session={clientSession} />;
}
