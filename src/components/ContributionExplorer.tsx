'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ContributionsView } from '@/components/ContributionsView';
import { HeroTabs } from '@/components/HeroTabs';
import { MultiUserForm } from '@/components/MultiUserForm';
import { SearchForm } from '@/components/SearchForm';
import { TimePeriodSelector } from '@/components/TimePeriodSelector';
import { ANALYTICS_EVENTS, trackClientEvent } from '@/lib/analytics-client';
import {
  DEFAULT_CONTRIBUTION_PERIOD,
  getContributionDateRange,
  getCustomRangeError,
  getPeriodSelectionFromSearchParams,
  getTodayUtc,
  normalizeCustomDateRange,
  type ContributionPeriod,
} from '@/lib/contribution-period';
import type { UserEntry, ViewMode } from '@/lib/types';

interface ContributionExplorerProps {
  /**
   * Optional second hero tab — the embed snippet generator. Passed in from the
   * page rather than imported here so this component stays responsible only for
   * lookup state. When omitted, the lookup form renders on its own without tab
   * chrome.
   */
  embedSlot?: ReactNode;
}

export function ContributionExplorer({ embedSlot }: ContributionExplorerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // null = auth check in progress; true/false once resolved
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [entries, setEntries] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  // Set when the user tries to apply the current custom inputs, so an empty
  // range is flagged then rather than as soon as "custom" is picked.
  const [rangeApplyAttempted, setRangeApplyAttempted] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [period, setPeriod] = useState<ContributionPeriod>(
    DEFAULT_CONTRIBUTION_PERIOD,
  );
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

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

  // Re-seed the selector from the URL once signed in and whenever the URL
  // changes (back/forward). Done during render rather than in an effect so the
  // selector never paints a stale period first.
  const [syncedSearchParams, setSyncedSearchParams] = useState<
    typeof searchParams | null
  >(null);
  if (authenticated === true && searchParams !== syncedSearchParams) {
    setSyncedSearchParams(searchParams);
    const selection = getPeriodSelectionFromSearchParams(searchParams);
    setPeriod(selection.period);
    setCustomFrom(selection.customFrom);
    setCustomTo(selection.customTo);
    setRangeApplyAttempted(false);
  }

  const customRange = useMemo(
    () => normalizeCustomDateRange(customFrom, customTo),
    [customFrom, customTo],
  );
  const appliedSelection = useMemo(
    () => getPeriodSelectionFromSearchParams(searchParams),
    [searchParams],
  );

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

  const rangeError =
    authenticated === true && period === 'custom'
      ? getCustomRangeError(customFrom, customTo, rangeApplyAttempted)
      : null;

  const updatePeriodInUrl = (
    nextPeriod: ContributionPeriod,
    nextRange: ReturnType<typeof normalizeCustomDateRange>,
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

  const handleSimpleSearch = (
    githubUsername: string,
    gitlabUsername: string,
    bitbucketUsername: string,
    giteaUsername: string,
    giteaInstanceUrl: string,
  ) => {
    const newEntries: UserEntry[] = [];
    if (githubUsername.trim()) {
      newEntries.push({
        id: 'anon-github',
        platform: 'github',
        username: githubUsername.trim(),
      });
    }
    if (gitlabUsername.trim()) {
      newEntries.push({
        id: 'anon-gitlab',
        platform: 'gitlab',
        username: gitlabUsername.trim(),
      });
    }
    if (bitbucketUsername.trim()) {
      newEntries.push({
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
      newEntries.push({
        id: 'anon-gitea',
        platform: 'gitea',
        username: giteaUsername.trim(),
        instanceUrl: giteaInstanceUrl.trim(),
      });
    }
    if (newEntries.length === 0) {
      setGlobalError('Enter at least one username.');
      return;
    }
    trackClientEvent(ANALYTICS_EVENTS.lookupRun, {
      authenticated: false,
      entry_count: newEntries.length,
      includes_gitea: newEntries.some((entry) => entry.platform === 'gitea'),
    });
    setGlobalError(null);
    setEntries(newEntries);
  };

  const handleMultiUserSearch = (newEntries: UserEntry[]) => {
    if (period === 'custom') {
      if (!customRange || getCustomRangeError(customFrom, customTo, true)) {
        setRangeApplyAttempted(true);
        return;
      }

      updatePeriodInUrl('custom', customRange);
    } else {
      const nextRange = getContributionDateRange(period, getTodayUtc());
      updatePeriodInUrl(period, nextRange);
    }

    setGlobalError(null);
    const seen = new Set<string>();
    const deduped = newEntries.filter((entry) => {
      const key = `${entry.platform}:${entry.username.trim().toLowerCase()}:${(entry.instanceUrl ?? '').trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    trackClientEvent(ANALYTICS_EVENTS.lookupRun, {
      authenticated: true,
      entry_count: deduped.length,
      includes_gitea: deduped.some((entry) => entry.platform === 'gitea'),
    });
    setEntries(deduped);
  };

  const handlePeriodChange = (nextPeriod: ContributionPeriod) => {
    setPeriod(nextPeriod);
    setRangeApplyAttempted(false);
    setGlobalError(null);

    if (nextPeriod === 'custom') {
      return;
    }

    if (authenticated !== true) {
      return;
    }

    const nextRange = getContributionDateRange(nextPeriod, getTodayUtc());
    updatePeriodInUrl(nextPeriod, nextRange);
    trackClientEvent(ANALYTICS_EVENTS.timeRangeSelected, {
      period: nextPeriod,
      mode: 'preset',
    });
  };

  const handleApplyCustomRange = () => {
    if (authenticated !== true) {
      return;
    }

    if (!customRange || getCustomRangeError(customFrom, customTo, true)) {
      setRangeApplyAttempted(true);
      return;
    }

    setGlobalError(null);
    updatePeriodInUrl('custom', customRange);
    trackClientEvent(ANALYTICS_EVENTS.timeRangeSelected, {
      period: 'custom',
      mode: 'custom',
    });
    // Trigger re-fetch by bumping entries identity
    setEntries((prev) => [...prev]);
  };

  const handleViewModeChange = (nextMode: ViewMode) => {
    setViewMode(nextMode);
    if (nextMode === 'integrated') {
      trackClientEvent(ANALYTICS_EVENTS.integratedViewUsed, {
        entry_count: entries.length,
      });
    }
  };

  const showMultiUser = authenticated === true;
  const showGitlabLimitNote =
    showMultiUser &&
    (period === 'last-year' ||
      (period === 'custom' &&
        customRange !== null &&
        customRange.from < getDefaultRange().from));

  const lookupPanel = showMultiUser ? (
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
        onCustomFromChange={(value) => {
          setCustomFrom(value);
          setRangeApplyAttempted(false);
        }}
        onCustomToChange={(value) => {
          setCustomTo(value);
          setRangeApplyAttempted(false);
        }}
        onApplyCustomRange={handleApplyCustomRange}
      />
    </>
  ) : (
    <SearchForm onSearch={handleSimpleSearch} loading={loading} />
  );

  return (
    <>
      {/* The hero panel is width-capped here rather than by the parent section
          so the results below can still use the full page width. */}
      <div className="max-w-3xl mx-auto">
        {embedSlot ? (
          <HeroTabs lookup={lookupPanel} embed={embedSlot} />
        ) : (
          lookupPanel
        )}
      </div>

      {globalError && (
        <div
          className="mt-6 p-4 rounded-lg border text-sm max-w-3xl mx-auto"
          style={{
            borderColor: '#f85149',
            color: '#f85149',
            backgroundColor: 'rgba(248,81,73,0.1)',
          }}
        >
          {globalError}
        </div>
      )}

      <ContributionsView
        entries={entries}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        from={appliedDateRange.from}
        to={appliedDateRange.to}
        onLoadingChange={setLoading}
      />
    </>
  );
}

function getDefaultRange() {
  return getContributionDateRange(DEFAULT_CONTRIBUTION_PERIOD, getTodayUtc());
}
