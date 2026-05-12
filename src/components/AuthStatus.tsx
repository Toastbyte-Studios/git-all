'use client';

import { useEffect, useState } from 'react';

interface AuthSessionResponse {
  authenticated: boolean;
  user?: {
    login: string;
    avatarUrl: string;
  };
}

export function AuthStatus() {
  const [session, setSession] = useState<AuthSessionResponse | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load auth session');
        }
        return response.json();
      })
      .then((data: AuthSessionResponse) => {
        if (isMounted) {
          setSession(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSession({ authenticated: false });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (session?.authenticated && session.user) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <img
          src={session.user.avatarUrl}
          alt={`${session.user.login} avatar`}
          width={20}
          height={20}
          className="rounded-full"
        />
        <span style={{ color: 'var(--text-secondary)' }}>
          @{session.user.login}
        </span>
        <a
          href="/api/auth/logout"
          style={{ color: 'var(--accent)' }}
          className="hover:underline"
        >
          Log out
        </a>
      </div>
    );
  }

  return (
    <a
      href="/api/auth/github"
      className="text-xs font-medium hover:underline"
      style={{ color: 'var(--accent)' }}
    >
      Sign in with GitHub
    </a>
  );
}
