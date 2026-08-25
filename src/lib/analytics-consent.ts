/**
 * Shared consent vocabulary for client and server.
 *
 * This module is imported from both a `'use client'` module and from route
 * handlers, so it must stay free of `'use client'` and of any runtime import
 * from `next/server`.
 *
 * Consent state lives in a cookie rather than localStorage because the server
 * has to be able to read it: the GA4 Measurement Protocol calls in
 * `analytics-server.ts` fire from route handlers, where localStorage does not
 * exist. One store, readable from both sides, cannot desync.
 */

export const ANALYTICS_CONSENT_COOKIE = 'analytics-consent';

/** One year, the usual ceiling for a consent record before re-prompting. */
export const ANALYTICS_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type ConsentValue = 'granted' | 'denied';

/**
 * `null` means the visitor has not chosen yet — distinct from 'denied'.
 * When consent is required, absent must be treated as denied for tracking
 * purposes but as unanswered for banner purposes.
 */
export type ConsentState = ConsentValue | 'not-required' | null;

export const ANALYTICS_CONSENT_REQUIRED =
  process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT === '1';

export function parseConsentValue(
  raw: string | null | undefined,
): ConsentValue | null {
  return raw === 'granted' || raw === 'denied' ? raw : null;
}
