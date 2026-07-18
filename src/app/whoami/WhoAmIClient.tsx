'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionsPanel } from '@/components/ConnectionsPanel';
import { ContributionsView } from '@/components/ContributionsView';
import { CopyToast } from '@/components/CopyToast';
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

interface CopyToastState {
  visible: boolean;
  success: boolean;
  username: string;
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

// ── Handle editor ─────────────────────────────────────────────────────

const HANDLE_DEBOUNCE_MS = 300;
const APP_URL = 'gitall.app';

interface HandleEditorProps {
  initialHandle: string | null;
  userId: string | null;
}

function HandleEditor({ initialHandle, userId }: HandleEditorProps) {
  const [handle, setHandle] = useState(initialHandle);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(initialHandle ?? '');
  const [availability, setAvailability] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const profileUrl = handle ? `https://${APP_URL}/u/${handle}` : null;

  const checkAvailability = useCallback((candidate: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAvailability('idle');

    if (!candidate.trim()) return;

    debounceRef.current = setTimeout(async () => {
      setAvailability('checking');
      try {
        const res = await fetch(
          `/api/profile/handle?candidate=${encodeURIComponent(candidate)}`,
        );
        const data = (await res.json()) as {
          available: boolean;
          valid: boolean;
        };
        if (!data.valid) {
          setAvailability('invalid');
        } else if (data.available) {
          setAvailability('available');
        } else {
          setAvailability('taken');
        }
      } catch {
        setAvailability('idle');
      }
    }, HANDLE_DEBOUNCE_MS);
  }, []);

  const handleInputChange = (value: string) => {
    setInputValue(value);
    setSaveError(null);
    checkAvailability(value);
  };

  const handleSave = async () => {
    if (!userId || !inputValue.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/profile/handle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: inputValue.trim() }),
      });
      if (res.ok) {
        setHandle(inputValue.trim());
        setEditing(false);
      } else {
        const data = (await res.json()) as {
          error: string;
          nextAllowedAt?: number;
        };
        if (data.error === 'cooldown' && data.nextAllowedAt) {
          const nextDate = new Date(data.nextAllowedAt).toLocaleDateString(
            undefined,
            { month: 'short', day: 'numeric' },
          );
          setSaveError(`You can change your handle again on ${nextDate}.`);
        } else if (data.error === 'handle_taken') {
          setSaveError('That handle is already taken.');
        } else if (data.error === 'invalid_handle') {
          setSaveError(
            'Invalid handle. Use 2–32 lowercase letters, numbers, or hyphens.',
          );
        } else if (data.error === 'db_unavailable') {
          setSaveError(
            'Profile database is unavailable. Run cf:preview or wrangler dev to use D1.',
          );
        } else {
          setSaveError('Something went wrong. Please try again.');
        }
      }
    } catch {
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  if (!userId) return null;

  return (
    <div
      className="rounded-lg p-3 space-y-2"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-secondary)' }}
      >
        Public profile
      </p>

      {!editing ? (
        <div className="flex items-center gap-2">
          {handle ? (
            <>
              <a
                href={`/u/${handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs truncate flex-1 hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                {APP_URL}/u/{handle}
              </a>
              <button
                type="button"
                onClick={handleCopyUrl}
                title="Copy profile URL"
                className="shrink-0 text-xs px-2 py-1 rounded transition-colors cursor-pointer"
                style={{
                  background: copied ? 'var(--accent-muted)' : 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: copied ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </>
          ) : (
            <span
              className="text-xs flex-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              No handle yet
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setInputValue(handle ?? '');
              setAvailability('idle');
              setSaveError(null);
              setEditing(true);
            }}
            className="shrink-0 text-xs px-2 py-1 rounded transition-colors cursor-pointer"
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            Edit
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span
              className="text-xs shrink-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              {APP_URL}/u/
            </span>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="your-handle"
              className="flex-1 text-xs rounded px-2 py-1 min-w-0"
              style={{
                background: 'var(--bg)',
                border: `1px solid ${
                  availability === 'available'
                    ? 'var(--accent)'
                    : availability === 'taken' || availability === 'invalid'
                      ? 'var(--error, #f85149)'
                      : 'var(--border)'
                }`,
                color: 'var(--text-primary)',
                outline: 'none',
              }}
              autoFocus
            />
          </div>

          {availability !== 'idle' && (
            <p
              className="text-xs"
              style={{
                color:
                  availability === 'available'
                    ? 'var(--accent)'
                    : availability === 'checking'
                      ? 'var(--text-secondary)'
                      : 'var(--error, #f85149)',
              }}
            >
              {availability === 'checking' && 'Checking…'}
              {availability === 'available' && '✓ Available'}
              {availability === 'taken' && '✗ Already taken'}
              {availability === 'invalid' &&
                '✗ Use 2–32 lowercase letters, numbers, or hyphens'}
            </p>
          )}

          {saveError && (
            <p className="text-xs" style={{ color: 'var(--error, #f85149)' }}>
              {saveError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={
                saving ||
                availability === 'taken' ||
                availability === 'invalid' ||
                !inputValue.trim()
              }
              className="text-xs px-3 py-1 rounded font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'var(--accent)',
                color: '#0d1117',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs px-3 py-1 rounded transition-colors cursor-pointer"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────────

export function WhoAmIClient({ session }: { session: ClientSession }) {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [period, setPeriod] = useState<ContributionPeriod>(
    DEFAULT_CONTRIBUTION_PERIOD,
  );
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copyToast, setCopyToast] = useState<CopyToastState>({
    visible: false,
    success: true,
    username: '',
  });
  const toastDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
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

  useEffect(
    () => () => {
      if (toastDismissTimerRef.current) {
        clearTimeout(toastDismissTimerRef.current);
      }
    },
    [],
  );

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

  const handleCopyUsernameResult = ({
    success,
    username,
  }: {
    success: boolean;
    username: string;
  }) => {
    if (toastDismissTimerRef.current) {
      clearTimeout(toastDismissTimerRef.current);
    }
    setCopyToast({ visible: true, success, username });
    toastDismissTimerRef.current = setTimeout(() => {
      setCopyToast((prev) => ({ ...prev, visible: false }));
      toastDismissTimerRef.current = null;
    }, 2000);
  };

  return (
    <>
      <main className="max-w-6xl mx-auto px-4 pt-8 pb-12">
        <div className="mb-6">
          <Link
            href="/"
            className="whoami-btn inline-flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-semibold transition-colors"
          >
            <span className="font-mono-data">
              <span aria-hidden="true" style={{ opacity: 0.6 }}>
                ${' '}
              </span>
              cd ~
            </span>
            <span className="sr-only"> Go to homepage</span>
          </Link>
        </div>
        <div className="flex flex-col md:flex-row gap-8">
          {/* ── Left column: identity + connections ─────────────── */}
          <aside className="md:w-72 shrink-0 space-y-6">
            {primaryConnection && (
              <ProfileHeader
                primary={session.primary}
                connections={session.connections}
                onCopyUsernameResult={handleCopyUsernameResult}
              />
            )}

            <HandleEditor
              initialHandle={session.handle}
              userId={session.userId}
            />

            <ConnectionsPanel
              connections={session.connections}
              availableProviders={session.availableProviders}
              onCopyUsernameResult={handleCopyUsernameResult}
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
      {copyToast.visible && (
        <CopyToast success={copyToast.success} username={copyToast.username} />
      )}
    </>
  );
}
