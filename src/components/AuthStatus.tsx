'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

interface AuthSessionResponse {
  authenticated: boolean;
  user?: {
    login: string;
    avatarUrl: string;
  };
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_not_configured: 'GitHub sign-in is not configured for this deployment.',
  invalid_state: 'Sign-in failed: session state mismatch. Please try again.',
  token_exchange_failed:
    'Sign-in failed: could not exchange token with GitHub.',
  user_fetch_failed: 'Sign-in failed: could not retrieve your GitHub profile.',
  invalid_user_data: 'Sign-in failed: invalid user data from GitHub.',
  session_create_failed: 'Sign-in failed: could not create your session.',
  oauth_callback_failed: 'Sign-in failed: unexpected error. Please try again.',
};

/** The official GitHub Invertocat mark SVG. Used white on dark backgrounds,
 *  dark (#24292f) on light backgrounds per GitHub logo guidelines. */
function GitHubMark({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 98 96"
      width="16"
      height="16"
      aria-hidden="true"
      fill={color}
    >
      <path d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
    </svg>
  );
}

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

  if (session.authenticated && session.user) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <Image
          src={session.user.avatarUrl}
          alt={`Avatar for @${session.user.login}`}
          width={24}
          height={24}
          className="rounded-full"
        />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
          @{session.user.login}
        </span>
        <form method="post" action="/api/auth/logout">
          <button
            type="submit"
            style={{ color: 'var(--text-secondary)' }}
            className="hover:underline cursor-pointer bg-transparent border-0 p-0 text-xs"
          >
            Sign out
          </button>
        </form>
      </div>
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
      <a
        href="/api/auth/github"
        className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
        style={{
          backgroundColor: '#24292f',
          color: '#ffffff',
          textDecoration: 'none',
          border: '1px solid var(--border)',
        }}
        aria-label="Sign in with GitHub"
      >
        <GitHubMark color="#ffffff" />
        Sign in with GitHub
      </a>
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
