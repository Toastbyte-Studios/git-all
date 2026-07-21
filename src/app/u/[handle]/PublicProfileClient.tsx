'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { ContributionsView } from '@/components/ContributionsView';
import { BitbucketIcon } from '@/components/icons/BitbucketIcon';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { GitLabIcon } from '@/components/icons/GitLabIcon';
import {
  DEFAULT_CONTRIBUTION_PERIOD,
  getContributionDateRange,
  getTodayUtc,
  type ContributionPeriod,
} from '@/lib/contribution-period';
import {
  PROVIDER_LABELS,
  PROVIDER_ORDER,
  PROVIDER_RING,
} from '@/lib/provider-ui';
import type {
  ConnectionProvider,
  Profile,
  UserEntry,
  ViewMode,
} from '@/lib/types';

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

export function PublicProfileClient({ profile }: { profile: Profile }) {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');

  const period: ContributionPeriod = DEFAULT_CONTRIBUTION_PERIOD;
  const { from, to } = useMemo(
    () => getContributionDateRange(period, getTodayUtc()),
    [period],
  );

  const entries: UserEntry[] = useMemo(
    () =>
      PROVIDER_ORDER.filter((p) =>
        profile.connections.some((c) => c.provider === p),
      ).map((p) => {
        const conn = profile.connections.find((c) => c.provider === p)!;
        return {
          id: `${p}:${conn.username}`,
          platform: p,
          username: conn.username,
        };
      }),
    [profile.connections],
  );

  const primaryConn = profile.connections.find(
    (c) => c.provider === profile.primaryProvider,
  );
  const connected = PROVIDER_ORDER.filter((p) =>
    profile.connections.some((c) => c.provider === p),
  );
  const stackOrder = [
    ...connected.filter((p) => p !== profile.primaryProvider),
    ...connected.filter((p) => p === profile.primaryProvider),
  ];

  return (
    <main className="max-w-6xl mx-auto px-4 pt-8 pb-12">
      <div className="flex flex-col md:flex-row gap-8">
        {/* ── Left column: identity ────────────────────────────────── */}
        <aside className="md:w-72 shrink-0 space-y-6">
          <div className="flex items-center gap-3" data-ui-chrome>
            {/* Avatar stack */}
            <div className="flex shrink-0">
              {stackOrder.map((provider, index) => {
                const conn = profile.connections.find(
                  (c) => c.provider === provider,
                )!;
                return (
                  <div
                    key={provider}
                    className="relative rounded-full"
                    style={{
                      marginLeft: index === 0 ? 0 : '-16px',
                      padding: '2px',
                      background: 'var(--bg)',
                      zIndex:
                        provider === profile.primaryProvider
                          ? stackOrder.length + 1
                          : index + 1,
                    }}
                  >
                    {conn.avatarUrl ? (
                      <Image
                        src={conn.avatarUrl}
                        alt={`Avatar for @${conn.username} on ${PROVIDER_LABELS[provider]}`}
                        width={44}
                        height={44}
                        className="rounded-full block"
                        style={{
                          border: `2px solid ${PROVIDER_RING[provider]}`,
                        }}
                      />
                    ) : (
                      <div
                        className="rounded-full block"
                        style={{
                          width: 44,
                          height: 44,
                          background: 'var(--bg-surface)',
                          border: `2px solid ${PROVIDER_RING[provider]}`,
                        }}
                      />
                    )}
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

            {/* Name + providers */}
            <div className="flex-1 min-w-0">
              <p
                className="font-semibold text-base truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {profile.displayName ??
                  (primaryConn ? `@${primaryConn.username}` : profile.handle)}
              </p>
              <ul
                className="text-xs flex items-center gap-1.5 mt-0.5 flex-wrap list-none m-0 p-0 [&>li::marker]:content-none"
                style={{
                  color: 'var(--text-secondary)',
                  paddingInlineStart: 0,
                }}
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
          </div>

          {/* Verified badge */}
          <p
            className="text-xs flex items-center gap-1.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span
              className="inline-flex items-center justify-center rounded-full text-xs font-semibold px-2 py-0.5"
              style={{
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
              }}
            >
              ✓ Verified
            </span>
            Contributions verified via OAuth
          </p>
        </aside>

        {/* ── Right column: contributions ──────────────────────────── */}
        <div className="flex-1 min-w-0">
          <ContributionsView
            entries={entries}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            from={from}
            to={to}
            showVerified
          />
        </div>
      </div>
    </main>
  );
}
