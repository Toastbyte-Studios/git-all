'use client';

import { useEffect, useState } from 'react';

const BANNER_DISMISSED_KEY = 'gitall_signin_banner_dismissed';

interface AuthSessionResponse {
  authenticated: boolean;
}

export function SignInBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show the banner for unauthenticated users who haven't dismissed it.
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(BANNER_DISMISSED_KEY) === 'true';
    } catch {
      // localStorage unavailable — treat as not dismissed
    }

    if (dismissed) return;

    fetch('/api/auth/session', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AuthSessionResponse | null) => {
        if (data && !data.authenticated) {
          setVisible(true);
        }
      })
      .catch(() => {
        /* silent — if session fetch fails, don't show the banner */
      });
  }, []);

  if (!visible) return null;

  function handleDismiss() {
    try {
      localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    } catch {
      // localStorage unavailable — skip persistence
    }
    setVisible(false);
  }

  return (
    <div
      role="region"
      aria-label="Sign-in benefits"
      className="max-w-2xl mx-auto mt-4 rounded-lg px-4 py-3 text-sm flex gap-3 items-start"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-secondary)',
      }}
    >
      <span aria-hidden="true" className="text-base leading-snug shrink-0">
        🔓
      </span>
      <div className="flex-1 min-w-0">
        <p
          className="font-medium mb-1"
          style={{ color: 'var(--text-primary)' }}
        >
          Sign in to unlock:
        </p>
        <ul className="space-y-0.5">
          <li className="flex gap-2">
            <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
              •
            </span>
            Compare up to 10 users across platforms
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
              •
            </span>
            Custom time ranges (YTD, last 6 months, custom dates)
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
              •
            </span>
            See your private contributions
          </li>
        </ul>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss sign-in benefits banner"
        className="shrink-0 cursor-pointer bg-transparent border-0 p-0 leading-none hover:opacity-70 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
      >
        ✕
      </button>
    </div>
  );
}
