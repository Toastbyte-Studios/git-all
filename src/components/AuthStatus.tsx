'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, type ReactElement } from 'react';
import { BitbucketIcon } from '@/components/icons/BitbucketIcon';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { GitLabIcon } from '@/components/icons/GitLabIcon';
import { getVisibleOAuthProviders } from '@/lib/oauth-providers';
import type { ConnectionProvider } from '@/lib/types';

interface AuthSessionResponse {
  authenticated: boolean;
  availableProviders?: ConnectionProvider[];
  primary?: ConnectionProvider;
  connections?: Partial<
    Record<
      ConnectionProvider,
      {
        provider: ConnectionProvider;
        accountId: string;
        username: string;
        avatarUrl: string;
        verifiedAt: number;
      }
    >
  >;
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_not_configured:
    'That sign-in provider is not configured for this deployment.',
  invalid_state: 'Sign-in failed: session state mismatch. Please try again.',
  token_exchange_failed:
    'Sign-in failed: could not complete the OAuth exchange.',
  user_fetch_failed: 'Sign-in failed: could not retrieve your profile.',
  invalid_user_data: 'Sign-in failed: invalid profile data from the provider.',
  session_create_failed: 'Sign-in failed: could not create your session.',
  oauth_callback_failed: 'Sign-in failed: unexpected error. Please try again.',
};

const PROVIDER_LABELS: Record<ConnectionProvider, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

const PROVIDER_ICONS: Record<ConnectionProvider, ReactElement> = {
  github: <GitHubIcon />,
  gitlab: <GitLabIcon />,
  bitbucket: <BitbucketIcon />,
};

const PROVIDER_SIGN_IN_CLASS: Record<ConnectionProvider, string> = {
  github: 'gh-sign-in-btn',
  gitlab: 'gl-sign-in-btn',
  bitbucket: 'bb-sign-in-btn',
};

const PROVIDER_ORDER: ConnectionProvider[] = ['github', 'gitlab', 'bitbucket'];

const PROVIDER_RING: Record<ConnectionProvider, string> = {
  github: 'var(--gh-accent)',
  gitlab: 'var(--gl-accent)',
  bitbucket: 'var(--bb-accent)',
};

export function AuthStatus() {
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Read and clear any auth error from the URL (set by the OAuth routes on failure).
    const params = new URLSearchParams(window.location.search);
    const error = params.get('auth_error');
    if (error) {
      setAuthError(error);
      const url = new URL(window.location.href);
      url.searchParams.delete('auth_error');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

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

  const errorMessage = authError
    ? (AUTH_ERROR_MESSAGES[authError] ?? 'Sign-in failed. Please try again.')
    : null;

  if (!session) {
    return errorMessage ? (
      <AuthErrorNotice
        message={errorMessage}
        onDismiss={() => setAuthError(null)}
      />
    ) : null;
  }

  const primaryConnection = session.primary
    ? session.connections?.[session.primary]
    : undefined;
  const visibleProviders = getVisibleOAuthProviders(session.availableProviders);

  if (session.authenticated && primaryConnection) {
    // All verified accounts, in stable order, with the primary rendered last
    // so it sits on top of the overlapping stack (mirrors the /whoami header).
    const connected = PROVIDER_ORDER.filter((p) => session.connections?.[p]);
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
        aria-label={`Open your profile — signed in as ${accountsLabel}`}
        className="whoami-btn inline-flex items-center gap-3 rounded-md px-6 py-2.5 text-sm font-semibold transition-colors"
      >
        <span className="flex shrink-0">
          {stackOrder.map((provider, index) => {
            const conn = session.connections![provider]!;
            return (
              <span
                key={provider}
                className="relative rounded-full"
                style={{
                  marginLeft: index === 0 ? 0 : '-9px',
                  padding: '2px',
                  // Gap between overlapping avatars matches the button fill.
                  background: 'var(--accent)',
                  zIndex:
                    provider === session.primary
                      ? stackOrder.length + 1
                      : index + 1,
                }}
              >
                <Image
                  src={conn.avatarUrl}
                  alt=""
                  width={22}
                  height={22}
                  className="block rounded-full"
                  style={{ border: `2px solid ${PROVIDER_RING[provider]}` }}
                />
              </span>
            );
          })}
        </span>
        <span className="font-mono-data">
          <span aria-hidden="true" style={{ opacity: 0.6 }}>
            ${' '}
          </span>
          whoami
        </span>
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {errorMessage && (
        <AuthErrorNotice
          message={errorMessage}
          onDismiss={() => setAuthError(null)}
        />
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {visibleProviders.map((provider) => (
          <a
            key={provider}
            href={`/api/auth/${provider}`}
            className={`${PROVIDER_SIGN_IN_CLASS[provider]} inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90`}
            aria-label={`Sign in with ${PROVIDER_LABELS[provider]}`}
          >
            {PROVIDER_ICONS[provider]}
            {PROVIDER_LABELS[provider]}
          </a>
        ))}
      </div>
    </div>
  );
}

function AuthErrorNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-secondary)',
      }}
    >
      <span aria-hidden="true">⚠️</span>
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="ml-1 cursor-pointer bg-transparent border-0 p-0 leading-none hover:opacity-70 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
      >
        ✕
      </button>
    </div>
  );
}
