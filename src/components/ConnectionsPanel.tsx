'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BitbucketIcon } from '@/components/icons/BitbucketIcon';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { GitLabIcon } from '@/components/icons/GitLabIcon';
import type { ConnectionProvider } from '@/lib/types';

interface ClientConnection {
  provider: ConnectionProvider;
  username: string;
  avatarUrl: string;
}

interface ConnectionsPanelProps {
  connections: Partial<Record<ConnectionProvider, ClientConnection>>;
  availableProviders: ConnectionProvider[];
}

const ALL_PROVIDERS: ConnectionProvider[] = ['github', 'gitlab', 'bitbucket'];

const PROVIDER_LABELS: Record<ConnectionProvider, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

const PROVIDER_COLOR_VARS: Record<ConnectionProvider, string> = {
  github: 'var(--gh-accent)',
  gitlab: 'var(--gl-accent)',
  bitbucket: 'var(--bb-accent)',
};

function ProviderIcon({ provider }: { provider: ConnectionProvider }) {
  if (provider === 'github') return <GitHubIcon size={14} />;
  if (provider === 'gitlab') return <GitLabIcon size={14} />;
  return <BitbucketIcon size={14} />;
}

export function ConnectionsPanel({
  connections,
  availableProviders,
}: ConnectionsPanelProps) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState<ConnectionProvider | null>(
    null,
  );
  const [errors, setErrors] = useState<
    Partial<Record<ConnectionProvider, string>>
  >({});

  const handleDisconnect = async (provider: ConnectionProvider) => {
    setDisconnecting(provider);
    setErrors((prev) => ({ ...prev, [provider]: undefined }));

    try {
      const res = await fetch(`/api/auth/connections/${provider}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrors((prev) => ({
          ...prev,
          [provider]:
            (data as { error?: string }).error ?? 'Failed to disconnect.',
        }));
        return;
      }

      // Server component re-renders with the updated session.
      // If the last provider was removed, the server component redirects to
      // /?signin=required automatically.
      router.refresh();
    } catch {
      setErrors((prev) => ({
        ...prev,
        [provider]: 'Network error. Please try again.',
      }));
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--border)' }}
    >
      <div
        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide"
        style={{
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        Connections
      </div>

      <ul>
        {ALL_PROVIDERS.map((provider, index) => {
          const connection = connections[provider];
          const isAvailable = availableProviders.includes(provider);
          const isLast = index === ALL_PROVIDERS.length - 1;

          return (
            <li
              key={provider}
              className="px-4 py-3 flex items-center gap-3 text-sm"
              style={{
                borderBottom: isLast ? 'none' : '1px solid var(--border)',
              }}
            >
              <span style={{ color: PROVIDER_COLOR_VARS[provider] }}>
                <ProviderIcon provider={provider} />
              </span>

              {connection ? (
                <>
                  <div className="flex-1 min-w-0">
                    <span
                      className="font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      @{connection.username}
                    </span>
                    <span
                      className="ml-2 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        backgroundColor: 'rgb(var(--accent-rgb) / 0.15)',
                        color: 'var(--accent)',
                        border: '1px solid rgb(var(--accent-rgb) / 0.3)',
                      }}
                      aria-label={`${PROVIDER_LABELS[provider]} verified`}
                    >
                      ✓ Verified
                    </span>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={() => void handleDisconnect(provider)}
                      disabled={disconnecting === provider}
                      className="text-xs cursor-pointer bg-transparent border-0 p-0 hover:opacity-70 transition-opacity disabled:opacity-50"
                      style={{ color: 'var(--text-secondary)' }}
                      aria-label={`Disconnect ${PROVIDER_LABELS[provider]}`}
                    >
                      {disconnecting === provider
                        ? 'Disconnecting…'
                        : 'Disconnect'}
                    </button>
                    {errors[provider] && (
                      <span
                        className="text-[10px]"
                        style={{ color: '#f85149' }}
                        role="alert"
                      >
                        {errors[provider]}
                      </span>
                    )}
                  </div>
                </>
              ) : isAvailable ? (
                <a
                  href={`/api/auth/${provider}`}
                  className="flex-1 text-xs font-medium hover:underline"
                  style={{ color: PROVIDER_COLOR_VARS[provider] }}
                >
                  Connect with {PROVIDER_LABELS[provider]}
                </a>
              ) : (
                <span
                  className="flex-1 text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {PROVIDER_LABELS[provider]} — not configured
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
