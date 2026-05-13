'use client';

import { useState } from 'react';
import type { UserResult } from '@/lib/types';

interface StatsBarProps {
  results: UserResult[];
}

const COLLAPSE_THRESHOLD = 4;

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
            color:
              r.entry.platform === 'github'
                ? 'var(--level-4)'
                : 'var(--gl-level-4)',
          }}
        >
          {r.entry.platform === 'github' ? 'GH' : 'GL'}:{' '}
          <span style={{ color: 'var(--text-secondary)' }}>
            @{r.entry.username}
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
