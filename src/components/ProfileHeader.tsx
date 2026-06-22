'use client';

import Image from 'next/image';
import { BitbucketIcon } from '@/components/icons/BitbucketIcon';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { GitLabIcon } from '@/components/icons/GitLabIcon';
import type { ConnectionProvider } from '@/lib/types';

interface ProfileHeaderConnection {
  provider: ConnectionProvider;
  username: string;
  avatarUrl: string;
}

interface ProfileHeaderProps {
  primary: ConnectionProvider;
  connection: ProfileHeaderConnection;
}

const PROVIDER_LABELS: Record<ConnectionProvider, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

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

export function ProfileHeader({ connection }: ProfileHeaderProps) {
  const handleShare = () => {
    // Share is stubbed — public profile URL ships in the companion persistence issue.
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Image
        src={connection.avatarUrl}
        alt={`Avatar for @${connection.username}`}
        width={48}
        height={48}
        className="rounded-full shrink-0"
        style={{ border: '2px solid var(--border)' }}
      />
      <div className="flex-1 min-w-0">
        <p
          className="font-semibold text-base truncate"
          style={{ color: 'var(--text-primary)' }}
        >
          @{connection.username}
        </p>
        <p
          className="text-xs flex items-center gap-1 mt-0.5"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ProviderIcon provider={connection.provider} size={12} />
          {PROVIDER_LABELS[connection.provider]}
        </p>
      </div>
      <button
        type="button"
        onClick={handleShare}
        title="Share your profile (coming soon)"
        aria-label="Share your profile (coming soon)"
        className="shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
        }}
      >
        Share
      </button>
    </div>
  );
}
