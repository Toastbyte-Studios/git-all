'use client';

import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_MAX_AGE_SECONDS,
  isAnalyticsConsentRequired,
  parseConsentValue,
  type ConsentState,
  type ConsentValue,
} from '@/lib/analytics-consent';
import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
} from '@/lib/analytics-events';

type AnalyticsParams = Record<
  string,
  string | number | boolean | null | undefined
>;

declare global {
  interface Window {
    zaraz?: {
      track?: (eventName: string, params?: Record<string, unknown>) => void;
      consent?: {
        setAll?: (value: boolean) => void;
      };
      set?: (key: string, value: unknown) => void;
    };
  }
}

// Consent moved from localStorage to a cookie so the server can read it. The
// server-side GA4 calls in analytics-server.ts previously ran regardless of
// what the visitor clicked, because localStorage is not readable from a route
// handler. Deliberately NOT HttpOnly: this component has to read and write it.
// It carries a single enum value, never an identifier.

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
    `Max-Age=${ANALYTICS_CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

function hasConsent() {
  if (!isAnalyticsConsentRequired()) {
    return true;
  }

  return readConsentCookie() === 'granted';
}

export function getAnalyticsConsentRequirement() {
  return isAnalyticsConsentRequired();
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

  try {
    window.zaraz?.consent?.setAll?.(granted);
    window.zaraz?.set?.('consent', { analytics: granted, ads: granted });
  } catch {
    // no-op
  }
}

export function readAnalyticsConsent(): ConsentState {
  if (!isAnalyticsConsentRequired() || typeof window === 'undefined') {
    return 'not-required';
  }

  return readConsentCookie();
}

export function trackClientEvent(
  eventName: AnalyticsEventName,
  params: AnalyticsParams = {},
) {
  if (typeof window === 'undefined' || !hasConsent()) {
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
    keepalive: true,
  }).catch(() => {});
}

export { ANALYTICS_EVENTS };
