'use client';

import { useState } from 'react';
import { getInstanceName } from '@/lib/gitea';
import type { UserResult } from '@/lib/types';

interface StatsBarProps {
  results: UserResult[];
}

const COLLAPSE_THRESHOLD = 4;

const PLATFORM_COLOR: Record<string, string> = {
  github: 'var(--level-4)',
  gitlab: 'var(--gl-level-4)',
  bitbucket: 'var(--bb-level-4)',
  gitea: 'var(--gt-level-4)',
};

const PLATFORM_SHORT_LABEL: Record<string, string> = {
  github: 'GH',
  gitlab: 'GL',
  bitbucket: 'BB',
  gitea: 'GT',
};

function formatEntryLabel(result: UserResult) {
  if (result.entry.platform !== 'gitea') {
    return `@${result.entry.username}`;
  }

  return `${getInstanceName(result.entry.instanceUrl)} — @${result.entry.username}`;
}

export function StatsBar({ results }: StatsBarProps) {
  const [expanded, setExpanded] = useState(false);

  const withData = results.filter((r) => r.data !== null);
  const total = withData.reduce(
    (sum, r) => sum + (r.data?.totalContributions ?? 0),
    0,
  );

  if (withData.length === 0) return null;

  const showToggle = withData.length > COLLAPSE_THRESHOLD;
  const visible =
    showToggle && !expanded ? withData.slice(0, COLLAPSE_THRESHOLD) : withData;

  return (
    <div className="flex flex-wrap gap-4 text-sm items-center">
      {visible.map((r) => (
        <span
          key={r.entry.id}
          style={{
            color: PLATFORM_COLOR[r.entry.platform] ?? 'var(--text-primary)',
          }}
        >
          {PLATFORM_SHORT_LABEL[r.entry.platform] ?? 'PL'}:{' '}
          <span style={{ color: 'var(--text-secondary)' }}>
            {formatEntryLabel(r)}
          </span>{' '}
          <strong>{r.data!.totalContributions.toLocaleString()}</strong>
        </span>
      ))}
      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="text-xs cursor-pointer bg-transparent border-0 p-0"
          style={{ color: 'var(--text-secondary)' }}
        >
          {expanded
            ? 'Show less'
            : `+${withData.length - COLLAPSE_THRESHOLD} more`}
        </button>
      )}
      {withData.length > 1 && (
        <span style={{ color: 'var(--text-secondary)' }}>
          Total: <strong>{total.toLocaleString()}</strong>
        </span>
      )}
    </div>
  );
}
