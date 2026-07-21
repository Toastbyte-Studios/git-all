'use client';

import Image from 'next/image';
import { CopyableUsername } from '@/components/CopyableUsername';
import { BitbucketIcon } from '@/components/icons/BitbucketIcon';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { GitLabIcon } from '@/components/icons/GitLabIcon';
import {
  PROVIDER_LABELS,
  PROVIDER_ORDER,
  PROVIDER_RING,
} from '@/lib/provider-ui';
import type { ConnectionProvider } from '@/lib/types';

const APP_URL = 'gitall.app';

interface ProfileHeaderConnection {
  provider: ConnectionProvider;
  username: string;
  avatarUrl: string;
}

interface ProfileHeaderProps {
  primary: ConnectionProvider;
  connections: Partial<Record<ConnectionProvider, ProfileHeaderConnection>>;
  /** Canonical GitAll handle, or null if not yet set. */
  handle: string | null;
  onCopyUsernameResult?: (result: {
    success: boolean;
    username: string;
  }) => void;
}

function ProviderIcon({
  provider,
  size = 14,
}: {
  provider: ConnectionProvider;
  size?: number;
}) {
  if (provider === 'github') return <GitHubIcon size={size} />;
  if (provider === 'gitlab') return <GitLabIcon size={size} />;
  return <BitbucketIcon size={size} />;
}

export function ProfileHeader({
  primary,
  connections,
  handle,
  onCopyUsernameResult,
}: ProfileHeaderProps) {
  // Connected providers in stable order. The primary is rendered last so it
  // sits on top of the overlapping avatar stack.
  const connected = PROVIDER_ORDER.filter((p) => connections[p]);
  const stackOrder = [
    ...connected.filter((p) => p !== primary),
    ...connected.filter((p) => p === primary),
  ];

  const primaryConnection = connections[primary] ?? connections[connected[0]];
  if (!primaryConnection) return null;

  const profileUrl = handle ? `https://${APP_URL}/u/${handle}` : null;

  return (
    <div className="flex items-center gap-3" data-ui-chrome>
      <div className="flex shrink-0">
        {stackOrder.map((provider, index) => {
          const conn = connections[provider]!;
          return (
            <div
              key={provider}
              className="relative rounded-full"
              style={{
                marginLeft: index === 0 ? 0 : '-16px',
                padding: '2px',
                background: 'var(--bg)',
                zIndex:
                  provider === primary ? stackOrder.length + 1 : index + 1,
              }}
            >
              <Image
                src={conn.avatarUrl}
                alt={`Avatar for @${conn.username} on ${PROVIDER_LABELS[provider]}`}
                width={44}
                height={44}
                className="rounded-full block"
                style={{ border: `2px solid ${PROVIDER_RING[provider]}` }}
              />
              <span
                className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full"
                style={{
                  width: 18,
                  height: 18,
                  background: PROVIDER_RING[provider],
                  border: '2px solid var(--bg)',
                  color: '#0d1117',
                }}
                aria-hidden="true"
              >
                <ProviderIcon provider={provider} size={10} />
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex-1 min-w-0">
        {handle ? (
          <CopyableUsername
            username={handle}
            className="font-semibold text-base"
            style={{ color: 'var(--text-primary)' }}
            onCopyResult={onCopyUsernameResult}
          />
        ) : (
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No handle set
          </span>
        )}
        <ul
          className="text-xs flex items-center gap-1.5 mt-0.5 flex-wrap list-none m-0 p-0 [&>li::marker]:content-none"
          style={{ color: 'var(--text-secondary)', paddingInlineStart: 0 }}
        >
          {connected.map((provider) => (
            <li
              key={provider}
              className="inline-flex items-center gap-1"
              style={{ listStyle: 'none' }}
            >
              <span style={{ color: PROVIDER_RING[provider] }}>
                <ProviderIcon provider={provider} size={12} />
              </span>
              {PROVIDER_LABELS[provider]}
            </li>
          ))}
        </ul>
      </div>

      {profileUrl ? (
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="View your public profile"
          aria-label="View your public profile"
          className="shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          Share
        </a>
      ) : (
        <button
          type="button"
          disabled
          title="Set a handle to share your profile"
          aria-label="Set a handle to share your profile"
          className="shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors opacity-50 cursor-not-allowed"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          Share
        </button>
      )}
    </div>
  );
}
