'use client';

import { useEffect, useState } from 'react';
import { ContributionGrid } from '@/components/ContributionGrid';
import { MultiUserForm } from '@/components/MultiUserForm';
import { SearchForm } from '@/components/SearchForm';
import { StatsBar } from '@/components/StatsBar';
import type {
  ContributionData,
  UserEntry,
  UserResult,
  ViewMode,
} from '@/lib/types';

/** Map a user's (platform, same-platform index) to a CSS color key. */
function getColorKey(
  platform: 'github' | 'gitlab',
  samePlatformIndex: number,
): string {
  if (samePlatformIndex === 0) return platform;
  // Cycle through variant suffixes 1 and 2 for any additional same-platform users.
  const variant = ((samePlatformIndex - 1) % 2) + 1;
  return `${platform}-${variant}`;
}

export function ContributionExplorer() {
  // null = auth check in progress; true/false once resolved
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');

  useEffect(() => {
    let isMounted = true;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (isMounted) setAuthenticated(data.authenticated === true);
      })
      .catch(() => {
        if (isMounted) setAuthenticated(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  /** Shared fetch logic used by both form variants. */
  const fetchEntries = async (entries: UserEntry[]) => {
    setLoading(true);
    setGlobalError(null);

    // Deduplicate by platform + lowercase username; keep first occurrence.
    const seen = new Set<string>();
    const deduped: UserEntry[] = [];
    for (const e of entries) {
      const key = `${e.platform}:${e.username.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(e);
      }
    }

    // Seed results so callers can see per-entry loading state if needed.
    setResults(deduped.map((entry) => ({ entry, data: null, error: null })));

    try {
      const settled = await Promise.all(
        deduped.map(async (entry): Promise<UserResult> => {
          try {
            const api = entry.platform === 'github' ? 'github' : 'gitlab';
            const res = await fetch(
              `/api/${api}?username=${encodeURIComponent(entry.username)}`,
            );
            const data = await res.json();
            if (data.error) {
              return { entry, data: null, error: String(data.error) };
            }
            return { entry, data, error: null };
          } catch (err) {
            return {
              entry,
              data: null,
              error: err instanceof Error ? err.message : 'Request failed',
            };
          }
        }),
      );

      setResults(settled);

      if (settled.length > 0 && settled.every((r) => r.error !== null)) {
        setGlobalError(
          'All lookups failed. Check the usernames and try again.',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  /** Handler for the simple anonymous two-input form. */
  const handleSimpleSearch = async (
    githubUsername: string,
    gitlabUsername: string,
  ) => {
    const entries: UserEntry[] = [];
    if (githubUsername.trim()) {
      entries.push({
        id: 'anon-github',
        platform: 'github',
        username: githubUsername.trim(),
      });
    }
    if (gitlabUsername.trim()) {
      entries.push({
        id: 'anon-gitlab',
        platform: 'gitlab',
        username: gitlabUsername.trim(),
      });
    }
    if (entries.length === 0) {
      setGlobalError('Enter at least one username.');
      return;
    }
    await fetchEntries(entries);
  };

  const hasData = results.some((r) => r.data !== null);

  // Assign each user a color key based on how many same-platform users appear before it.
  const platformCounts: Record<string, number> = {};
  const resultsWithColorKey = results.map((r) => {
    const platform = r.entry.platform;
    const idx = platformCounts[platform] ?? 0;
    platformCounts[platform] = idx + 1;
    return { ...r, colorKey: getColorKey(platform, idx) };
  });

  const showMultiUser = authenticated === true;

  return (
    <>
      {showMultiUser ? (
        <MultiUserForm onSearch={fetchEntries} loading={loading} />
      ) : (
        <SearchForm onSearch={handleSimpleSearch} loading={loading} />
      )}

      {globalError && (
        <div
          className="mt-6 p-4 rounded-lg border text-sm"
          style={{
            borderColor: '#f85149',
            color: '#f85149',
            backgroundColor: 'rgba(248,81,73,0.1)',
          }}
        >
          {globalError}
        </div>
      )}

      {hasData && (
        <div className="mt-10">
          <div className="flex items-center justify-between mb-6">
            <StatsBar results={results} />
            <div
              className="flex gap-1 p-1 rounded-lg"
              style={{ backgroundColor: 'var(--bg-surface)' }}
            >
              {(['side-by-side', 'integrated'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  aria-pressed={viewMode === mode}
                  className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer"
                  style={{
                    backgroundColor:
                      viewMode === mode ? 'var(--bg-elevated)' : 'transparent',
                    color:
                      viewMode === mode
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                  }}
                >
                  {mode === 'side-by-side' ? 'Side by Side' : 'Integrated'}
                </button>
              ))}
            </div>
          </div>

          {viewMode === 'side-by-side' ? (
            <div className="space-y-8">
              {resultsWithColorKey.map((r) => (
                <div key={r.entry.id}>
                  <h2
                    className="text-sm font-medium mb-3"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {r.entry.platform === 'github' ? 'GitHub' : 'GitLab'} — @
                    {r.entry.username}
                  </h2>
                  {r.data ? (
                    <ContributionGrid data={r.data} colorKey={r.colorKey} />
                  ) : (
                    <div
                      className="p-4 rounded-lg border text-sm"
                      style={{
                        borderColor: '#f85149',
                        color: '#f85149',
                        backgroundColor: 'rgba(248,81,73,0.1)',
                      }}
                    >
                      {r.error ?? 'No data available.'}
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
                    .map((r) => `@${r.entry.username}`)
                    .join(' + ')}`}
              </h2>
              <ContributionGrid
                data={mergeAllContributions(results.map((r) => r.data))}
                colorKey="integrated"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
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

  const totalContributions = calendar.reduce((sum, d) => sum + d.count, 0);

  return {
    platform: 'integrated',
    username: sources
      .filter((d): d is ContributionData => d !== null)
      .map((d) => d.username)
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
