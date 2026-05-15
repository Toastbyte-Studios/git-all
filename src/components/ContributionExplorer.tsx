'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ContributionGrid } from '@/components/ContributionGrid';
import { MultiUserForm } from '@/components/MultiUserForm';
import { SearchForm } from '@/components/SearchForm';
import { StatsBar } from '@/components/StatsBar';
import { TimePeriodSelector } from '@/components/TimePeriodSelector';
import {
  DEFAULT_CONTRIBUTION_PERIOD,
  getContributionDateRange,
  getPeriodSelectionFromSearchParams,
  getTodayUtc,
  isRangeWithinOneYear,
  normalizeCustomDateRange,
  type ContributionDateRange,
  type ContributionPeriod,
} from '@/lib/contribution-period';
import { getInstanceName, normalizeInstanceUrl } from '@/lib/gitea';
import type {
  ContributionData,
  UserEntry,
  UserResult,
  ViewMode,
} from '@/lib/types';

/** Map a user's platform to its CSS color key. */
function getColorKey(platform: UserEntry['platform']): string {
  return platform;
}

export function ContributionExplorer() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // null = auth check in progress; true/false once resolved
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [results, setResults] = useState<UserResult[]>([]);
  const [lastEntries, setLastEntries] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [period, setPeriod] = useState<ContributionPeriod>(
    DEFAULT_CONTRIBUTION_PERIOD,
  );
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const requestSequence = useRef(0);
  const lastRequestedRange = useRef<ContributionDateRange | null>(null);

  const invalidatePendingRequests = () => {
    requestSequence.current += 1;
    setLoading(false);
  };

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

  useEffect(() => {
    if (authenticated !== true) {
      return;
    }

    const selection = getPeriodSelectionFromSearchParams(searchParams);
    setPeriod(selection.period);
    setCustomFrom(selection.customFrom);
    setCustomTo(selection.customTo);
  }, [authenticated, searchParams]);

  const customRange = useMemo(
    () => normalizeCustomDateRange(customFrom, customTo),
    [customFrom, customTo],
  );
  const appliedSelection = useMemo(
    () => getPeriodSelectionFromSearchParams(searchParams),
    [searchParams],
  );

  const selectedRange = useMemo(() => {
    if (authenticated !== true) {
      return getDefaultRange();
    }

    if (period === 'custom') {
      return customRange;
    }

    return getContributionDateRange(period, getTodayUtc());
  }, [authenticated, customRange, period]);
  const appliedDateRange = useMemo(() => {
    if (authenticated !== true) {
      return getDefaultRange();
    }

    if (appliedSelection.period === 'custom') {
      return (
        normalizeCustomDateRange(
          appliedSelection.customFrom,
          appliedSelection.customTo,
        ) ?? getDefaultRange()
      );
    }

    return getContributionDateRange(appliedSelection.period, getTodayUtc());
  }, [appliedSelection, authenticated]);

  useEffect(() => {
    if (authenticated !== true || period !== 'custom') {
      setRangeError(null);
      return;
    }

    if (!customFrom && !customTo) {
      setRangeError(null);
      return;
    }

    if (!customRange) {
      setRangeError('Enter a valid custom date range.');
      return;
    }

    if (!isRangeWithinOneYear(customRange)) {
      setRangeError('Custom ranges can span at most 1 year.');
      return;
    }

    setRangeError(null);
  }, [authenticated, customFrom, customRange, customTo, period]);

  const updatePeriodInUrl = (
    nextPeriod: ContributionPeriod,
    nextRange: ContributionDateRange | null,
  ) => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete('period');
    nextSearchParams.delete('from');
    nextSearchParams.delete('to');

    if (nextPeriod === 'custom' && nextRange) {
      nextSearchParams.set('from', nextRange.from);
      nextSearchParams.set('to', nextRange.to);
    } else if (nextPeriod !== DEFAULT_CONTRIBUTION_PERIOD) {
      nextSearchParams.set('period', nextPeriod);
    }

    const query = nextSearchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  /** Shared fetch logic used by both form variants. */
  const fetchEntries = useCallback(
    async (entries: UserEntry[], rangeOverride?: ContributionDateRange) => {
      const requestRange = rangeOverride ?? selectedRange;

      if (!requestRange) {
        setGlobalError('Enter a valid custom date range before searching.');
        return;
      }

      if (!isRangeWithinOneYear(requestRange)) {
        setGlobalError('Date ranges can span at most 1 year.');
        return;
      }

      setLoading(true);
      setGlobalError(null);

      // Deduplicate by platform + lowercase username; keep first occurrence.
      const seen = new Set<string>();
      const deduped: UserEntry[] = [];
      for (const entry of entries) {
        const key = `${entry.platform}:${entry.username.toLowerCase()}:${entry.platform === 'gitea' ? (normalizeInstanceUrl(entry.instanceUrl ?? '') ?? '') : ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(entry);
        }
      }

      // Allocate the request token before publishing this fetch's state so any
      // older completions are ignored consistently on the next render.
      const requestId = ++requestSequence.current;
      setLastEntries(deduped);

      // Seed results so callers can see per-entry loading state if needed.
      lastRequestedRange.current = requestRange;
      setResults(deduped.map((entry) => ({ entry, data: null, error: null })));

      try {
        const settled = await Promise.all(
          deduped.map(async (entry): Promise<UserResult> => {
            let nextResult: UserResult;
            try {
              const params = new URLSearchParams({
                username: entry.username,
                from: requestRange.from,
                to: requestRange.to,
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
              setResults((currentResults) =>
                currentResults.map((result) =>
                  result.entry.id === entry.id ? nextResult : result,
                ),
              );
            }

            return nextResult;
          }),
        );

        if (
          requestId === requestSequence.current &&
          settled.length > 0 &&
          settled.every((r) => r.error !== null)
        ) {
          setGlobalError(
            'All lookups failed. Check the usernames and try again.',
          );
        }
      } finally {
        if (requestId === requestSequence.current) {
          setLoading(false);
        }
      }
    },
    [selectedRange],
  );

  useEffect(() => {
    if (authenticated !== true || lastEntries.length === 0) {
      return;
    }

    // Skip redundant refetches when the URL-backed applied range already
    // matches the range for the most recent in-flight or rendered lookup.
    if (isSameRange(lastRequestedRange.current, appliedDateRange)) {
      return;
    }

    void fetchEntries(lastEntries, appliedDateRange);
  }, [appliedDateRange, authenticated, fetchEntries, lastEntries]);

  /** Handler for the simple anonymous two-input form. */
  const handleSimpleSearch = async (
    githubUsername: string,
    gitlabUsername: string,
    bitbucketUsername: string,
    giteaUsername: string,
    giteaInstanceUrl: string,
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
    if (bitbucketUsername.trim()) {
      entries.push({
        id: 'anon-bitbucket',
        platform: 'bitbucket',
        username: bitbucketUsername.trim(),
      });
    }
    if (giteaUsername.trim()) {
      if (!giteaInstanceUrl.trim()) {
        setGlobalError('Enter a Gitea / Forgejo instance URL.');
        return;
      }
      entries.push({
        id: 'anon-gitea',
        platform: 'gitea',
        username: giteaUsername.trim(),
        instanceUrl: giteaInstanceUrl.trim(),
      });
    }
    if (entries.length === 0) {
      setGlobalError('Enter at least one username.');
      return;
    }
    // Anonymous users intentionally stay on the default trailing 12-month view
    // because period selection is only available for authenticated sessions.
    await fetchEntries(entries, getDefaultRange());
  };

  const handleMultiUserSearch = async (entries: UserEntry[]) => {
    if (period === 'custom') {
      if (!customRange) {
        setRangeError('Enter a valid custom date range.');
        return;
      }

      if (!isRangeWithinOneYear(customRange)) {
        setRangeError('Custom ranges can span at most 1 year.');
        return;
      }

      updatePeriodInUrl('custom', customRange);
      await fetchEntries(entries, customRange);
      return;
    }

    await fetchEntries(
      entries,
      getContributionDateRange(period, getTodayUtc()),
    );
  };

  const handlePeriodChange = (nextPeriod: ContributionPeriod) => {
    setPeriod(nextPeriod);
    setGlobalError(null);

    if (nextPeriod === 'custom') {
      invalidatePendingRequests();
      return;
    }

    if (authenticated !== true) {
      return;
    }

    const nextRange = getContributionDateRange(nextPeriod, getTodayUtc());
    updatePeriodInUrl(nextPeriod, nextRange);

    if (lastEntries.length > 0) {
      void fetchEntries(lastEntries, nextRange);
    }
  };

  const handleApplyCustomRange = () => {
    if (authenticated !== true) {
      return;
    }

    if (!customRange) {
      setRangeError('Enter a valid custom date range.');
      return;
    }

    if (!isRangeWithinOneYear(customRange)) {
      setRangeError('Custom ranges can span at most 1 year.');
      return;
    }

    setGlobalError(null);
    updatePeriodInUrl('custom', customRange);

    if (lastEntries.length > 0) {
      void fetchEntries(lastEntries, customRange);
    }
  };

  const hasEntries = results.length > 0;

  // Assign each user a color key based on their platform.
  const resultsWithColorKey = results.map((result) => ({
    ...result,
    colorKey: getColorKey(result.entry.platform),
  }));

  const showMultiUser = authenticated === true;
  const showGitlabLimitNote =
    showMultiUser &&
    (period === 'last-year' ||
      (period === 'custom' &&
        customRange !== null &&
        customRange.from < getDefaultRange().from));

  return (
    <>
      {showMultiUser ? (
        <>
          <MultiUserForm onSearch={handleMultiUserSearch} loading={loading} />
          <TimePeriodSelector
            period={period}
            customFrom={customFrom}
            customTo={customTo}
            loading={loading}
            error={rangeError}
            showGitlabLimitNote={showGitlabLimitNote}
            onPeriodChange={handlePeriodChange}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
            onApplyCustomRange={handleApplyCustomRange}
          />
        </>
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

      {hasEntries && (
        <div className="mt-10">
          <div className="flex items-center justify-between mb-6 gap-4">
            <StatsBar results={results} />
            <div
              className="flex gap-1 p-1 rounded-lg shrink-0"
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
              {resultsWithColorKey.map((result) => (
                <div key={result.entry.id}>
                  <h2
                    className="text-sm font-medium mb-3"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {formatResultLabel(result)}
                  </h2>
                  {result.data ? (
                    <>
                      <ContributionGrid
                        data={result.data}
                        colorKey={result.colorKey}
                      />
                      {result.data.platform === 'gitlab' &&
                        result.data.dateRange.from &&
                        result.data.dateRange.to &&
                        (result.data.dateRange.from > appliedDateRange.from ||
                          result.data.dateRange.to < appliedDateRange.to) && (
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
                {results.filter((result) => result.data).length > 0 &&
                  ` \u2014 ${results
                    .filter((result) => result.data)
                    .map((result) => formatResultLabel(result))
                    .join(' + ')}`}
              </h2>
              <ContributionGrid
                data={mergeAllContributions(
                  results.map((result) => result.data),
                )}
                colorKey="integrated"
              />
            </div>
          )}
        </div>
      )}
    </>
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

function getDefaultRange() {
  return getContributionDateRange(DEFAULT_CONTRIBUTION_PERIOD, getTodayUtc());
}

function isSameRange(
  left: ContributionDateRange | null,
  right: ContributionDateRange | null,
) {
  if (left === null || right === null) {
    return left === right;
  }

  return left.from === right.from && left.to === right.to;
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
