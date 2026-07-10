'use client';

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

const CONSENT_STORAGE_KEY = 'analytics-consent';
const CONSENT_REQUIRED =
  process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT === '1';

function hasConsent() {
  if (!CONSENT_REQUIRED) {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) === 'granted';
  } catch {
    return false;
  }
}

export function getAnalyticsConsentRequirement() {
  return CONSENT_REQUIRED;
}

export function setAnalyticsConsent(granted: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      granted ? 'granted' : 'denied',
    );
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

export function readAnalyticsConsent() {
  if (!CONSENT_REQUIRED || typeof window === 'undefined') {
    return 'not-required' as const;
  }
  let value: string | null = null;
  try {
    value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    return null;
  }
  return value === 'granted' || value === 'denied' ? value : null;
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
