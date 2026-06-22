'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ContributionsView } from '@/components/ContributionsView';
import { MultiUserForm } from '@/components/MultiUserForm';
import { SearchForm } from '@/components/SearchForm';
import { TimePeriodSelector } from '@/components/TimePeriodSelector';
import {
  DEFAULT_CONTRIBUTION_PERIOD,
  getContributionDateRange,
  getPeriodSelectionFromSearchParams,
  getTodayUtc,
  isRangeWithinOneYear,
  normalizeCustomDateRange,
  type ContributionPeriod,
} from '@/lib/contribution-period';
import type { UserEntry, ViewMode } from '@/lib/types';

export function ContributionExplorer() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // null = auth check in progress; true/false once resolved
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [entries, setEntries] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
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
    setGlobalError(null);
    setEntries(newEntries);
  };

  const handleMultiUserSearch = (newEntries: UserEntry[]) => {
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
    } else {
      const nextRange = getContributionDateRange(period, getTodayUtc());
      updatePeriodInUrl(period, nextRange);
    }

    setGlobalError(null);
    const seen = new Set<string>();
    const deduped = newEntries.filter((entry) => {
      const key = `${entry.platform}:${entry.username}:${entry.instanceUrl ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setEntries(deduped);
  };

  const handlePeriodChange = (nextPeriod: ContributionPeriod) => {
    setPeriod(nextPeriod);
    setGlobalError(null);

    if (nextPeriod === 'custom') {
      return;
    }

    if (authenticated !== true) {
      return;
    }

    const nextRange = getContributionDateRange(nextPeriod, getTodayUtc());
    updatePeriodInUrl(nextPeriod, nextRange);
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
    // Trigger re-fetch by bumping entries identity
    setEntries((prev) => [...prev]);
  };

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

      <ContributionsView
        entries={entries}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
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
