import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth-session';
import { getAvailableOAuthProviders } from '@/lib/oauth-providers';
import { getProfileSummaryByUserId } from '@/lib/profiles';
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
  /** Whether the profile is published at /u/<handle>. Defaults to false. */
  isPublic: boolean;
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

  // Attempt to load the user's profile handle and visibility from D1
  // (non-fatal). If this fails we fall back to private — never to public.
  let handle: string | null = null;
  let isPublic = false;
  try {
    if (session.userId) {
      const summary = await getProfileSummaryByUserId(session.userId);
      if (summary) {
        handle = summary.handle;
        isPublic = summary.isPublic;
      }
    }
  } catch {
    // DB unavailable in plain next dev — handle stays null, isPublic stays false
  }

  const clientSession: ClientSession = {
    primary: session.primary,
    connections: sanitizedConnections,
    availableProviders: getAvailableOAuthProviders(),
    handle,
    isPublic,
    userId: session.userId ?? null,
  };

  return <WhoAmIClient session={clientSession} />;
}
