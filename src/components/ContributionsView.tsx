'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AgentAttributionSummary,
  type AgentAttributionAudience,
} from '@/components/AgentAttributionSummary';
import { ContributionGrid } from '@/components/ContributionGrid';
import { StatsBar } from '@/components/StatsBar';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import { getInstanceName } from '@/lib/gitea';
import type {
  ContributionData,
  Platform,
  SavedAgentSummary,
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
  /**
   * Who is viewing, when agent-attributed counts (summary line and
   * tooltips) should be shown at all; omit to hide them. Some platforms
   * return these fields for anyone, so the view, not the API, is the gate:
   * pass `public` only for an owner who has opted in.
   */
  agentAttribution?: AgentAttributionAudience;
  /**
   * Saved public-repos-only summaries, used for a platform whose live
   * response has no agent fields (GitHub, for anyone but the owner).
   */
  savedAgentSummaries?: Partial<Record<Platform, SavedAgentSummary>>;
}

export function ContributionsView({
  entries,
  viewMode,
  onViewModeChange,
  from,
  to,
  showVerified,
  onLoadingChange,
  agentAttribution,
  savedAgentSummaries,
}: ContributionsViewProps) {
  const showAgentAttribution = agentAttribution !== undefined;
  const withSaved = (data: ContributionData | null, platform: Platform) =>
    data && showAgentAttribution
      ? withSavedAgentSummary(data, savedAgentSummaries?.[platform])
      : data;
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoadingState] = useState(false);
  const onLoadingChangeRef = useRef(onLoadingChange);
  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
  });

  const setLoading = (value: boolean) => {
    setLoadingState(value);
    onLoadingChangeRef.current?.(value);
  };
  const requestSequence = useRef(0);

  const fetchContributions = useCallback(async () => {
    if (entries.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

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
    // Fetching is what effects are for; the synchronous part only resets the
    // panels to their loading state before the requests go out.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchContributions();
  }, [fetchContributions]);

  const globalError =
    !loading && results.length > 0 && results.every((r) => r.error !== null)
      ? 'All lookups failed. Check the usernames and try again.'
      : null;

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
                    showAgentCounts={showAgentAttribution}
                  />
                  {agentAttribution && (
                    <AgentAttributionSummary
                      data={withSaved(result.data, result.entry.platform)!}
                      audience={agentAttribution}
                    />
                  )}
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
          <IntegratedView
            sources={results.map((r) => withSaved(r.data, r.entry.platform))}
            agentAttribution={agentAttribution}
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

function IntegratedView({
  sources,
  agentAttribution,
}: {
  sources: (ContributionData | null)[];
  agentAttribution?: AgentAttributionAudience;
}) {
  const merged = mergeAllContributions(sources);
  return (
    <>
      <ContributionGrid
        data={merged}
        colorKey="integrated"
        showAgentCounts={agentAttribution !== undefined}
      />
      {agentAttribution && (
        <AgentAttributionSummary data={merged} audience={agentAttribution} />
      )}
    </>
  );
}

/**
 * Fills in a saved summary's totals when a live response has no agent
 * fields. A live read always wins: it's fresher, and for the owner it's the
 * fuller picture.
 */
export function withSavedAgentSummary(
  data: ContributionData,
  saved: SavedAgentSummary | undefined,
): ContributionData {
  if (!saved || data.agentContributions !== undefined) return data;
  return {
    ...data,
    agentContributions: saved.agentContributions,
    agentBreakdown: saved.agentBreakdown,
    agentSummaryComputedAt: saved.computedAt,
  };
}

/**
 * Sums every source's calendar by date. Agent fields are merged only from
 * sources that reported them, and are left off entirely when none did, so
 * the combined view keeps the "absent = not checked" rule.
 */
export function mergeAllContributions(
  sources: (ContributionData | null)[],
): ContributionData {
  const present = sources.filter(
    (data): data is ContributionData => data !== null,
  );
  const checked = present.filter(
    (data) => data.agentContributions !== undefined,
  );

  const counts = new Map<string, number>();
  const agentCounts = new Map<string, number>();

  for (const data of present) {
    for (const entry of data.calendar) {
      counts.set(entry.date, (counts.get(entry.date) ?? 0) + entry.count);
      if (entry.agentCount) {
        agentCounts.set(
          entry.date,
          (agentCounts.get(entry.date) ?? 0) + entry.agentCount,
        );
      }
    }
  }

  const hasAgentData = checked.length > 0;
  const calendar = Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      date,
      count,
      level: countToLevel(count),
      ...(hasAgentData && { agentCount: agentCounts.get(date) ?? 0 }),
    }));

  const totalContributions = calendar.reduce((sum, day) => sum + day.count, 0);

  const merged: ContributionData = {
    platform: 'integrated',
    username: present.map((data) => data.username).join(' + '),
    totalContributions,
    dateRange: {
      from: calendar[0]?.date ?? null,
      to: calendar[calendar.length - 1]?.date ?? null,
    },
    calendar,
  };

  const savedAt = checked
    .map((data) => data.agentSummaryComputedAt)
    .filter((at): at is number => at !== undefined);
  if (savedAt.length > 0) {
    // The oldest, so "as of" never claims fresher data than it has.
    merged.agentSummaryComputedAt = Math.min(...savedAt);
  }

  if (hasAgentData) {
    const agentBreakdown: NonNullable<ContributionData['agentBreakdown']> = {};
    for (const data of checked) {
      for (const [agent, n] of Object.entries(data.agentBreakdown ?? {})) {
        const key = agent as keyof typeof agentBreakdown;
        agentBreakdown[key] = (agentBreakdown[key] ?? 0) + (n ?? 0);
      }
    }
    merged.agentContributions = checked.reduce(
      (sum, data) => sum + (data.agentContributions ?? 0),
      0,
    );
    merged.agentBreakdown = agentBreakdown;
  }

  return merged;
}

function countToLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 7) return 2;
  if (count <= 15) return 3;
  return 4;
}
