'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionsPanel } from '@/components/ConnectionsPanel';
import { ContributionsView } from '@/components/ContributionsView';
import { ProfileHeader } from '@/components/ProfileHeader';
import { TimePeriodSelector } from '@/components/TimePeriodSelector';
import {
  DEFAULT_CONTRIBUTION_PERIOD,
  getContributionDateRange,
  getTodayUtc,
  isRangeWithinOneYear,
  normalizeCustomDateRange,
  type ContributionPeriod,
} from '@/lib/contribution-period';
import type { ConnectionProvider, UserEntry, ViewMode } from '@/lib/types';
import type { ClientSession } from './page';

const LS_VIEW_MODE = 'gitall:me:view-mode';
const LS_TIME_RANGE = 'gitall:me:time-range';

interface StoredTimeRange {
  period: ContributionPeriod;
  customFrom: string;
  customTo: string;
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore write errors
  }
}

const PROVIDER_ORDER: ConnectionProvider[] = ['github', 'gitlab', 'bitbucket'];

export function WhoAmIClient({ session }: { session: ClientSession }) {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [period, setPeriod] = useState<ContributionPeriod>(
    DEFAULT_CONTRIBUTION_PERIOD,
  );
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hydrated = useRef(false);

  // Hydrate preferences from localStorage on mount.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    const savedMode = readStorage<ViewMode>(LS_VIEW_MODE, 'side-by-side');
    if (savedMode === 'side-by-side' || savedMode === 'integrated') {
      setViewMode(savedMode);
    }

    const savedRange = readStorage<StoredTimeRange>(LS_TIME_RANGE, {
      period: DEFAULT_CONTRIBUTION_PERIOD,
      customFrom: '',
      customTo: '',
    });
    setPeriod(savedRange.period);
    setCustomFrom(savedRange.customFrom);
    setCustomTo(savedRange.customTo);
  }, []);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    writeStorage(LS_VIEW_MODE, mode);
  };

  const customRange = useMemo(
    () => normalizeCustomDateRange(customFrom, customTo),
    [customFrom, customTo],
  );

  const appliedDateRange = useMemo(() => {
    if (period === 'custom') {
      return (
        customRange ??
        getContributionDateRange(DEFAULT_CONTRIBUTION_PERIOD, getTodayUtc())
      );
    }
    return getContributionDateRange(period, getTodayUtc());
  }, [period, customRange]);

  useEffect(() => {
    if (period !== 'custom') {
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
  }, [customFrom, customRange, customTo, period]);

  const handlePeriodChange = (nextPeriod: ContributionPeriod) => {
    setPeriod(nextPeriod);
    setRangeError(null);
    writeStorage(LS_TIME_RANGE, {
      period: nextPeriod,
      customFrom,
      customTo,
    });
  };

  const handleCustomFromChange = (value: string) => {
    setCustomFrom(value);
    writeStorage(LS_TIME_RANGE, { period, customFrom: value, customTo });
  };

  const handleCustomToChange = (value: string) => {
    setCustomTo(value);
    writeStorage(LS_TIME_RANGE, { period, customFrom, customTo: value });
  };

  const handleApplyCustomRange = () => {
    if (!customRange) {
      setRangeError('Enter a valid custom date range.');
      return;
    }
    if (!isRangeWithinOneYear(customRange)) {
      setRangeError('Custom ranges can span at most 1 year.');
      return;
    }
    setRangeError(null);
    // Persist and let appliedDateRange memo update, which flows to ContributionsView.
    writeStorage(LS_TIME_RANGE, { period: 'custom', customFrom, customTo });
  };

  // Build UserEntry[] from verified connections (provider order is stable).
  const entries: UserEntry[] = useMemo(
    () =>
      PROVIDER_ORDER.filter((p): p is ConnectionProvider =>
        Boolean(session.connections[p]),
      ).map((p) => ({
        id: `${p}:${session.connections[p]!.username}`,
        platform: p,
        username: session.connections[p]!.username,
      })),
    [session.connections],
  );

  const primaryConnection = session.connections[session.primary];

  const showGitlabLimitNote =
    period === 'last-year' ||
    (period === 'custom' &&
      customRange !== null &&
      customRange.from <
        getContributionDateRange(DEFAULT_CONTRIBUTION_PERIOD, getTodayUtc())
          .from);

  const connectionCount = PROVIDER_ORDER.filter(
    (p) => session.connections[p],
  ).length;

  return (
    <>
      <main className="max-w-6xl mx-auto px-4 pt-8 pb-12">
        <div className="flex flex-col md:flex-row gap-8">
          {/* ── Left column: identity + connections ─────────────── */}
          <aside className="md:w-72 shrink-0 space-y-6">
            {primaryConnection && (
              <ProfileHeader
                primary={session.primary}
                connections={session.connections}
              />
            )}

            <ConnectionsPanel
              connections={session.connections}
              availableProviders={session.availableProviders}
            />

            {connectionCount === 1 && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Connect more providers to compare them side by side.
              </p>
            )}
          </aside>

          {/* ── Right column: contributions ──────────────────────── */}
          <div className="flex-1 min-w-0">
            <TimePeriodSelector
              period={period}
              customFrom={customFrom}
              customTo={customTo}
              loading={loading}
              error={rangeError}
              showGitlabLimitNote={showGitlabLimitNote}
              onPeriodChange={handlePeriodChange}
              onCustomFromChange={handleCustomFromChange}
              onCustomToChange={handleCustomToChange}
              onApplyCustomRange={handleApplyCustomRange}
            />

            <ContributionsView
              entries={entries}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              from={appliedDateRange.from}
              to={appliedDateRange.to}
              showVerified
              onLoadingChange={setLoading}
            />
          </div>
        </div>
      </main>
    </>
  );
}
