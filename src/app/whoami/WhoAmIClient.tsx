'use client';

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

// ── Handle editor ────────────────────────────────────────────────────

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
  const checkRequestIdRef = useRef(0);
  const checkAbortRef = useRef<AbortController | null>(null);

  const profileUrl = handle ? `https://${APP_URL}/u/${handle}` : null;

  const checkAvailability = useCallback((candidate: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    checkAbortRef.current?.abort();
    setAvailability('idle');

    if (!candidate.trim()) return;

    debounceRef.current = setTimeout(async () => {
      const requestId = ++checkRequestIdRef.current;
      const abortController = new AbortController();
      checkAbortRef.current = abortController;
      setAvailability('checking');
      try {
        const res = await fetch(
          `/api/profile/handle?candidate=${encodeURIComponent(candidate)}`,
          { signal: abortController.signal },
        );
        if (requestId !== checkRequestIdRef.current) return;
        const data = (await res.json()) as {
          available: boolean;
          valid: boolean;
        };
        if (requestId !== checkRequestIdRef.current) return;
        if (!data.valid) {
          setAvailability('invalid');
        } else if (data.available) {
          setAvailability('available');
        } else {
          setAvailability('taken');
        }
      } catch {
        if (requestId !== checkRequestIdRef.current) return;
        setAvailability('idle');
      }
    }, HANDLE_DEBOUNCE_MS);
  }, []);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      checkAbortRef.current?.abort();
    },
    [],
  );

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
    } catch {
      // ignore clipboard errors
    }
  };

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

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
        Profile handle
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

// ── Visibility toggle ────────────────────────────────────────────────

interface VisibilityToggleProps {
  initialIsPublic: boolean;
  handle: string | null;
  userId: string | null;
}

/**
 * Opt-in control for publishing the profile. Off by default — there is
 * deliberately no first-run modal or interstitial, and nothing pre-checked:
 * a consent prompt the user has to dismiss is the pattern this feature exists
 * to avoid. The copy states plainly what enabling it does rather than leaving
 * the user to infer it from the label.
 */
function VisibilityToggle({
  initialIsPublic,
  handle,
  userId,
}: VisibilityToggleProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    const next = !isPublic;
    setSaving(true);
    setError(null);
    // Optimistic — rolled back below if the write fails, so the switch never
    // shows "public" for a profile the server still has as private.
    setIsPublic(next);

    try {
      const res = await fetch('/api/profile/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: next }),
      });

      if (!res.ok) {
        setIsPublic(!next);
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error === 'db_unavailable'
            ? 'Profile database is unavailable. Run cf:preview or wrangler dev to use D1.'
            : 'Could not update visibility. Please try again.',
        );
      }
    } catch {
      setIsPublic(!next);
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
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
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-secondary)' }}
          >
            Public profile
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            {isPublic
              ? `On. Anyone can read ${APP_URL}/u/${handle ?? 'your-handle'}, and search engines can index it.`
              : 'Off. Your profile is private — that URL returns “not found” for everyone except you.'}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          aria-label="Publish profile publicly"
          disabled={saving}
          onClick={handleToggle}
          className="shrink-0 relative rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            width: 36,
            height: 20,
            background: isPublic ? 'var(--accent)' : 'var(--bg)',
            border: '1px solid var(--border)',
          }}
        >
          <span
            className="absolute rounded-full transition-all"
            style={{
              width: 14,
              height: 14,
              top: 2,
              left: isPublic ? 18 : 2,
              background: isPublic ? '#0d1117' : 'var(--text-secondary)',
            }}
          />
        </button>
      </div>

      {isPublic && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Turning this off takes effect immediately, though browsers may hold a
          copy of the page for up to a minute.
        </p>
      )}

      {error && (
        <p className="text-xs" style={{ color: 'var(--error, #f85149)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ── Account deletion ─────────────────────────────────────────────────

interface DeleteAccountProps {
  handle: string | null;
  userId: string | null;
}

/**
 * Destructive-action confirmation: the user has to type their handle, matching
 * how GitHub and Stripe gate irreversible deletes. The typed value is also sent
 * to the API and re-checked server-side.
 */
function DeleteAccount({ handle, userId }: DeleteAccountProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = handle !== null && confirmation.trim() === handle;

  const handleDelete = async () => {
    if (!confirmed || handle === null) return;
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch('/api/profile', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      });

      if (res.ok) {
        // Full navigation rather than a router push: the session cookie is gone
        // and every cached RSC payload for this session is now stale.
        window.location.href = '/?deleted=1';
        return;
      }

      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(
        data?.error === 'db_unavailable'
          ? 'Profile database is unavailable. Run cf:preview or wrangler dev to use D1.'
          : 'Could not delete your account. Please try again.',
      );
      setDeleting(false);
    } catch {
      setError('Network error. Please try again.');
      setDeleting(false);
    }
  };

  if (!userId || !handle) return null;

  return (
    <div
      className="rounded-lg p-3 space-y-2"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--error, #f85149)',
      }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--error, #f85149)' }}
      >
        Delete account
      </p>

      {!open ? (
        <>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Removes your profile, your handle, and every connected account from
            GitAll. Your contributions on GitHub, GitLab and Bitbucket are not
            affected.
          </p>
          <button
            type="button"
            onClick={() => {
              setConfirmation('');
              setError(null);
              setOpen(true);
            }}
            className="text-xs px-3 py-1 rounded transition-colors cursor-pointer"
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--error, #f85149)',
              color: 'var(--error, #f85149)',
            }}
          >
            Delete my account
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            This cannot be undone. Type <strong>{handle}</strong> to confirm.
          </p>

          <input
            type="text"
            value={confirmation}
            onChange={(e) => {
              setConfirmation(e.target.value);
              setError(null);
            }}
            placeholder={handle}
            aria-label={`Type ${handle} to confirm deletion`}
            className="w-full text-xs rounded px-2 py-1"
            style={{
              background: 'var(--bg)',
              border: `1px solid ${
                confirmation && !confirmed
                  ? 'var(--error, #f85149)'
                  : 'var(--border)'
              }`,
              color: 'var(--text-primary)',
              outline: 'none',
            }}
            autoFocus
          />

          {error && (
            <p className="text-xs" style={{ color: 'var(--error, #f85149)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={!confirmed || deleting}
              className="text-xs px-3 py-1 rounded font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'var(--error, #f85149)',
                color: '#0d1117',
              }}
            >
              {deleting ? 'Deleting…' : 'Permanently delete'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={deleting}
              className="text-xs px-3 py-1 rounded transition-colors cursor-pointer disabled:opacity-50"
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
        <div className="flex flex-col md:flex-row gap-8">
          {/* ── Left column: identity + connections ────────────── */}
          <aside className="md:w-72 shrink-0 space-y-6">
            {primaryConnection && (
              <ProfileHeader
                primary={session.primary}
                connections={session.connections}
                handle={session.handle}
                onCopyUsernameResult={handleCopyUsernameResult}
              />
            )}

            <HandleEditor
              initialHandle={session.handle}
              userId={session.userId}
            />

            <VisibilityToggle
              initialIsPublic={session.isPublic}
              handle={session.handle}
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

            <DeleteAccount handle={session.handle} userId={session.userId} />
          </aside>

          {/* ── Right column: contributions ────────────────────── */}
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
