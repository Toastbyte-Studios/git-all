'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ContributionGrid } from '@/components/ContributionGrid';
import { StatsBar } from '@/components/StatsBar';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import { getInstanceName } from '@/lib/gitea';
import type {
  ContributionData,
  UserEntry,
  UserResult,
  ViewMode,
} from '@/lib/types';

interface ContributionsViewProps {
  entries: UserEntry[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  from: string;
  to: string;
  /** When true, each panel header shows a "Verified" chip. */
  showVerified?: boolean;
  /** Called whenever the internal loading state changes. */
  onLoadingChange?: (loading: boolean) => void;
}

export function ContributionsView({
  entries,
  viewMode,
  onViewModeChange,
  from,
  to,
  showVerified,
  onLoadingChange,
}: ContributionsViewProps) {
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoadingState] = useState(false);
  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;

  const setLoading = (value: boolean) => {
    setLoadingState(value);
    onLoadingChangeRef.current?.(value);
  };
  const [globalError, setGlobalError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const fetchContributions = useCallback(async () => {
    if (entries.length === 0) {
      setResults([]);
      setLoading(false);
      setGlobalError(null);
      return;
    }

    setLoading(true);
    setGlobalError(null);

    const requestId = ++requestSequence.current;

    setResults(entries.map((entry) => ({ entry, data: null, error: null })));

    try {
      await Promise.all(
        entries.map(async (entry): Promise<void> => {
          let nextResult: UserResult;
          try {
            const params = new URLSearchParams({
              username: entry.username,
              from,
              to,
            });
            if (entry.platform === 'gitea' && entry.instanceUrl) {
              params.set('instanceUrl', entry.instanceUrl);
            }
            const res = await fetch(
              `/api/${entry.platform}?${params.toString()}`,
            );
            const data = await res.json();
            if (data.error) {
              nextResult = { entry, data: null, error: String(data.error) };
            } else {
              nextResult = { entry, data, error: null };
            }
          } catch (err) {
            nextResult = {
              entry,
              data: null,
              error: err instanceof Error ? err.message : 'Request failed',
            };
          }

          if (requestId === requestSequence.current) {
            setResults((current) =>
              current.map((r) => (r.entry.id === entry.id ? nextResult : r)),
            );
          }
        }),
      );
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }, [entries, from, to]);

  useEffect(() => {
    void fetchContributions();
  }, [fetchContributions]);

  useEffect(() => {
    if (
      !loading &&
      results.length > 0 &&
      results.every((r) => r.error !== null)
    ) {
      setGlobalError('All lookups failed. Check the usernames and try again.');
    }
  }, [results, loading]);

  if (results.length === 0 && !loading) {
    return null;
  }

  if (loading && results.every((r) => r.data === null && r.error === null)) {
    return (
      <div
        className="mt-10 p-4 rounded-lg text-sm"
        style={{
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-secondary)',
        }}
      >
        Loading contributions…
      </div>
    );
  }

  return (
    <div className="mt-10">
      {globalError && (
        <div
          className="mb-6 p-4 rounded-lg border text-sm"
          style={{
            borderColor: '#f85149',
            color: '#f85149',
            backgroundColor: 'rgba(248,81,73,0.1)',
          }}
        >
          {globalError}
        </div>
      )}

      <div className="flex items-center justify-between mb-6 gap-4">
        <StatsBar results={results} />
        <ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} />
      </div>

      {viewMode === 'side-by-side' ? (
        <div className="space-y-8">
          {results.map((result) => (
            <div key={result.entry.id}>
              <h2
                className="text-sm font-medium mb-3 flex items-center gap-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                {formatResultLabel(result)}
                {showVerified && result.data && <VerifiedChip />}
              </h2>
              {result.data ? (
                <>
                  <ContributionGrid
                    data={result.data}
                    colorKey={result.entry.platform}
                  />
                  {result.data.platform === 'gitlab' &&
                    result.data.dateRange.from &&
                    result.data.dateRange.to &&
                    (result.data.dateRange.from > from ||
                      result.data.dateRange.to < to) && (
                      <p
                        className="mt-2 text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        GitLab only returned data from{' '}
                        <strong>{result.data.dateRange.from}</strong> to{' '}
                        <strong>{result.data.dateRange.to}</strong> for this
                        lookup.
                      </p>
                    )}
                </>
              ) : (
                <div
                  className="p-4 rounded-lg border text-sm"
                  style={{
                    borderColor:
                      result.error === null ? 'var(--border)' : '#f85149',
                    color:
                      result.error === null
                        ? 'var(--text-secondary)'
                        : '#f85149',
                    backgroundColor:
                      result.error === null
                        ? 'var(--bg-surface)'
                        : 'rgba(248,81,73,0.1)',
                  }}
                >
                  {result.error ??
                    `Loading ${getPlatformLabel(result.entry.platform)} contributions…`}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div>
          <h2
            className="text-sm font-medium mb-3"
            style={{ color: 'var(--text-secondary)' }}
          >
            Combined Activity
            {results.filter((r) => r.data).length > 0 &&
              ` \u2014 ${results
                .filter((r) => r.data)
                .map((r) => formatResultLabel(r))
                .join(' + ')}`}
          </h2>
          <ContributionGrid
            data={mergeAllContributions(results.map((r) => r.data))}
            colorKey="integrated"
          />
        </div>
      )}
    </div>
  );
}

function VerifiedChip() {
  return (
    <span className="verified-badge" aria-label="Verified connection">
      ✓ Verified
    </span>
  );
}

function getPlatformLabel(platform: UserEntry['platform']) {
  if (platform === 'github') return 'GitHub';
  if (platform === 'gitlab') return 'GitLab';
  if (platform === 'bitbucket') return 'Bitbucket';
  return 'Gitea / Forgejo';
}

function formatResultLabel(result: UserResult) {
  if (result.entry.platform !== 'gitea') {
    return `${getPlatformLabel(result.entry.platform)} — @${result.entry.username}`;
  }

  return `${getInstanceName(result.entry.instanceUrl)} — @${result.entry.username}`;
}

function mergeAllContributions(
  sources: (ContributionData | null)[],
): ContributionData {
  const map = new Map<string, number>();

  for (const data of sources) {
    if (!data) continue;
    for (const entry of data.calendar) {
      map.set(entry.date, (map.get(entry.date) ?? 0) + entry.count);
    }
  }

  const calendar = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count, level: countToLevel(count) }));

  const totalContributions = calendar.reduce((sum, day) => sum + day.count, 0);

  return {
    platform: 'integrated',
    username: sources
      .filter((data): data is ContributionData => data !== null)
      .map((data) => data.username)
      .join(' + '),
    totalContributions,
    dateRange: {
      from: calendar[0]?.date ?? null,
      to: calendar[calendar.length - 1]?.date ?? null,
    },
    calendar,
  };
}

function countToLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 7) return 2;
  if (count <= 15) return 3;
  return 4;
}
