'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ConnectionProvider } from '@/lib/types';

interface AuthSessionResponse {
  authenticated: boolean;
  primary?: ConnectionProvider;
  connections?: Partial<
    Record<
      ConnectionProvider,
      {
        provider: ConnectionProvider;
        username: string;
        avatarUrl: string;
      }
    >
  >;
}

const PROVIDER_ORDER: ConnectionProvider[] = ['github', 'gitlab', 'bitbucket'];

const PROVIDER_LABELS: Record<ConnectionProvider, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

const PROVIDER_RING: Record<ConnectionProvider, string> = {
  github: 'var(--gh-accent)',
  gitlab: 'var(--gl-accent)',
  bitbucket: 'var(--bb-accent)',
};

/**
 * Renders the connected-account avatar stack in the site header.
 * Fetches the auth session client-side and shows nothing while loading
 * or when the user is unauthenticated.
 */
export function HeaderAvatars() {
  const [session, setSession] = useState<AuthSessionResponse | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AuthSessionResponse | null) => {
        if (isMounted) setSession(data);
      })
      .catch(() => {
        if (isMounted) setSession({ authenticated: false });
      });
    return () => {
      isMounted = false;
    };
  }, []);

  if (!session?.authenticated || !session.primary || !session.connections) {
    return null;
  }

  const connected = PROVIDER_ORDER.filter((p) => session.connections![p]);
  if (connected.length === 0) return null;

  const stackOrder = [
    ...connected.filter((p) => p !== session.primary),
    ...connected.filter((p) => p === session.primary),
  ];

  const accountsLabel = connected
    .map((p) => `${PROVIDER_LABELS[p]} @${session.connections![p]!.username}`)
    .join(', ');

  return (
    <Link
      href="/whoami"
      aria-label={`Your profile — ${accountsLabel}`}
      className="flex shrink-0 items-center rounded-full transition-opacity hover:opacity-80"
    >
      {stackOrder.map((provider, index) => {
        const conn = session.connections![provider]!;
        return (
          <span
            key={provider}
            className="relative rounded-full"
            style={{
              marginLeft: index === 0 ? 0 : '-10px',
              padding: '2px',
              background: 'var(--bg)',
              zIndex:
                provider === session.primary
                  ? stackOrder.length + 1
                  : index + 1,
            }}
          >
            <Image
              src={conn.avatarUrl}
              alt={`Avatar for @${conn.username} on ${PROVIDER_LABELS[provider]}`}
              width={28}
              height={28}
              className="block rounded-full"
              style={{ border: `2px solid ${PROVIDER_RING[provider]}` }}
            />
          </span>
        );
      })}
    </Link>
  );
}
