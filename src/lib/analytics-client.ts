'use client';

import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_MAX_AGE_SECONDS,
  ANALYTICS_CONSENT_REQUIRED,
  ANALYTICS_CONSENT_SAME_SITE,
  CONSENT_EXEMPT_EVENTS,
  parseConsentValue,
  ZARAZ_CONSENT_COOKIES,
  type ConsentState,
  type ConsentValue,
} from '@/lib/analytics-consent';
import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
} from '@/lib/analytics-events';

export type AnalyticsParams = Record<
  string,
  string | number | boolean | null | undefined
>;

declare global {
  interface Window {
    zaraz?: {
      track?: (eventName: string, params?: Record<string, unknown>) => void;
      consent?: {
        APIReady?: boolean;
        setAll?: (value: boolean) => void;
        getAll?: () => Record<string, boolean>;
        // Delivers Pageview events Zaraz withheld while consent was absent.
        // Called by the banner immediately after a visitor accepts, otherwise
        // the first pageview of the session is lost.
        sendQueuedEvents?: () => void;
      };
      set?: (key: string, value: unknown) => void;
    };
  }
}

function readConsentCookie(): ConsentValue | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const prefix = `${ANALYTICS_CONSENT_COOKIE}=`;
  const entry = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!entry) {
    return null;
  }

  try {
    return parseConsentValue(decodeURIComponent(entry.slice(prefix.length)));
  } catch {
    return null;
  }
}

function writeConsentCookie(value: ConsentValue) {
  // Secure is conditional so the cookie still sets on http://localhost during
  // `next dev`; production is HTTPS-only and always gets it.
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    `${ANALYTICS_CONSENT_COOKIE}=${value}; Path=/; ` +
    `Max-Age=${ANALYTICS_CONSENT_MAX_AGE_SECONDS}; ` +
    `SameSite=${ANALYTICS_CONSENT_SAME_SITE}${secure}`;
}

function hasCookie(name: string): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  return document.cookie
    .split(';')
    .some((part) => part.trim().startsWith(`${name}=`));
}

function mayTrack(eventName: AnalyticsEventName): boolean {
  if (!ANALYTICS_CONSENT_REQUIRED) {
    return true;
  }
  if (CONSENT_EXEMPT_EVENTS.has(eventName)) {
    return true;
  }
  // Absent consent is a decline, never permission.
  return readConsentCookie() === 'granted';
}

export function getAnalyticsConsentRequirement(): boolean {
  return ANALYTICS_CONSENT_REQUIRED;
}

/**
 * The visitor's recorded choice, for the consent banner to decide whether to
 * show. `null` means unanswered, which is distinct from 'denied'.
 */
export function readAnalyticsConsent(): ConsentState {
  if (!ANALYTICS_CONSENT_REQUIRED || typeof window === 'undefined') {
    return 'not-required';
  }
  return readConsentCookie();
}

export function setAnalyticsConsent(granted: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    writeConsentCookie(granted ? 'granted' : 'denied');
  } catch {
    // no-op
  }

  // Zaraz maintains its own consent state for the tools it loads. Without
  // this it would keep sending to GA4 regardless of the cookie above.
  try {
    window.zaraz?.consent?.setAll?.(granted);
    window.zaraz?.set?.('consent', { analytics: granted, ads: granted });
  } catch {
    // no-op
  }
}

/**
 * Copies the current Zaraz consent state into the `analytics-consent` cookie.
 *
 * Deliberately does NOT call `setAnalyticsConsent`: that writes back into
 * Zaraz via `consent.setAll`, and this runs from Zaraz's own change event.
 * Only the cookie is written here.
 *
 * Identifies the "Analytics" purpose by name and mirrors only that value, so a
 * future second purpose being granted cannot silently switch analytics on.
 * Falls back to "any granted purpose" if the purpose metadata is unavailable.
 *
 * On gitall.app `getAll()` currently returns a single key — the zone's random
 * Analytics purpose ID — so the fallback and the by-name path agree today. The
 * by-name lookup is what keeps that true if a purpose is ever added.
 */
function syncConsentFromZaraz() {
  const getAll = window.zaraz?.consent?.getAll;
  if (typeof getAll !== 'function') {
    return;
  }

  try {
    const all = getAll();
    const consent = window.zaraz?.consent as
      | { purposes?: Record<string, { id?: string; name?: unknown }> }
      | undefined;
    const purposes = consent?.purposes;

    const analyticsPurposeId = purposes
      ? Object.values(purposes).find((p) => {
          const name = p?.name;
          if (typeof name === 'string') return name === 'Analytics';
          if (name && typeof name === 'object') {
            return Object.values(name as Record<string, unknown>).includes(
              'Analytics',
            );
          }
          return false;
        })?.id
      : undefined;

    const granted = analyticsPurposeId
      ? Boolean(all[analyticsPurposeId])
      : Object.values(all).some(Boolean);

    writeConsentCookie(granted ? 'granted' : 'denied');
  } catch {
    // no-op
  }
}

/**
 * Backfills the cookie for a visitor who answered the Zaraz modal before this
 * bridge shipped, or in a session where our cookie was cleared but Zaraz's was
 * not.
 *
 * Guarded on Zaraz having a recorded choice. Without that guard a first-time
 * visitor who has not answered yet would be written as 'denied', erasing the
 * distinction between "declined" and "not asked" that `readAnalyticsConsent`
 * exposes to the banner.
 */
function reconcileExistingConsent() {
  if (readConsentCookie() !== null) {
    return;
  }
  if (!ZARAZ_CONSENT_COOKIES.some((name) => hasCookie(name))) {
    return;
  }
  syncConsentFromZaraz();
}

let consentBridgeInitialized = false;

/**
 * Bridges the Zaraz consent state to the server-side path.
 *
 * Zaraz gates only the tools it loads itself. `src/lib/analytics-server.ts`
 * reaches GA4 through the Measurement Protocol, outside Zaraz entirely, and
 * can only see the `analytics-consent` cookie. Without this bridge a visitor
 * could decline in Zaraz and still have server events delivered.
 *
 * Called once from AnalyticsConsentBanner, which is mounted in the root
 * layout. Safe to call before Zaraz has loaded, and a no-op if it never does.
 *
 * Idempotent: guarded by a module-level flag so a remount (StrictMode, hot
 * reload, or a second banner instance) cannot register duplicate listeners.
 */
export function initAnalyticsConsentBridge() {
  if (typeof window === 'undefined' || consentBridgeInitialized) {
    return;
  }
  consentBridgeInitialized = true;

  // Fired every time the visitor changes their preferences.
  document.addEventListener('zarazConsentChoicesUpdated', syncConsentFromZaraz);

  // The Consent API loads asynchronously and its ready event may already have
  // fired by the time this runs, so check the flag as well as listening.
  if (window.zaraz?.consent?.APIReady) {
    reconcileExistingConsent();
  } else {
    document.addEventListener('zarazConsentAPIReady', reconcileExistingConsent);
  }
}

/**
 * Send one event to GA4.
 *
 * Zaraz is the primary path: it is enabled on this zone, serves the analytics
 * script from gitall.app rather than a third-party domain, and attaches the
 * event to the visitor's real GA4 session — so geo, device, referrer and
 * session stitching all come along for free. The GA4 measurement ID lives in
 * the Zaraz dashboard configuration, not in this repository.
 *
 * The route-handler fallback exists for the case where Zaraz has not loaded: a
 * blocked script, a slow edge, or a request that fires before Zaraz is ready.
 * It reaches GA4 through the Measurement Protocol with a server-derived
 * identifier, so those events will NOT join the same session. That is a
 * deliberate trade — a detached event is worth more than no event — but it
 * means the fallback should stay the exception, not the norm.
 */
export function trackClientEvent(
  eventName: AnalyticsEventName,
  params: AnalyticsParams = {},
) {
  if (typeof window === 'undefined' || !mayTrack(eventName)) {
    return;
  }

  if (typeof window.zaraz?.track === 'function') {
    window.zaraz.track(eventName, params);
    return;
  }

  void fetch('/api/analytics/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventName, params }),
    // Some events fire as the user is navigating away.
    keepalive: true,
  }).catch(() => {});
}

export { ANALYTICS_EVENTS };
