import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
} from '@/lib/analytics-events';

/**
 * Shared consent vocabulary for client and server.
 *
 * This module is imported from a `'use client'` module AND from route
 * handlers, so it must stay free of `'use client'` and of any runtime import
 * from `next/server` or from `node:*`.
 *
 * Consent state lives in a cookie rather than localStorage because the server
 * has to be able to read it: the GA4 Measurement Protocol calls in
 * `analytics-server.ts` fire from route handlers, where localStorage does not
 * exist. Before this, `hasConsent()` guarded only the browser path, so a
 * visitor who declined still had every server-side event delivered to GA4 —
 * the decline was a false promise. One store, readable from both sides,
 * cannot desync and cannot lie.
 */

export const ANALYTICS_CONSENT_COOKIE = 'analytics-consent';

/** One year, the usual ceiling for a consent record before re-prompting. */
export const ANALYTICS_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type ConsentValue = 'granted' | 'denied';

/**
 * `null` means the visitor has not chosen yet, which is distinct from
 * 'denied'. Absent must be treated as denied for tracking purposes but as
 * unanswered for banner purposes — the banner shows on null, not on 'denied'.
 */
export type ConsentState = ConsentValue | 'not-required' | null;

/**
 * Read at call time rather than captured in a module-level const so tests can
 * toggle it. Next inlines NEXT_PUBLIC_* at build time on the client, so this
 * still resolves to a literal in the browser bundle.
 */
export function isAnalyticsConsentRequired(): boolean {
  return process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT === '1';
}

export function parseConsentValue(
  raw: string | null | undefined,
): ConsentValue | null {
  return raw === 'granted' || raw === 'denied' ? raw : null;
}

/**
 * Events delivered even when consent is absent or denied.
 *
 * THIS SET SHOULD CONTAIN EXACTLY ONE ENTRY. Read the reasoning before adding
 * a second — the exemption is defensible only because of properties specific
 * to embed traffic, and widening it to an ordinary first-party event would
 * turn a technical necessity into a loophole.
 *
 * `embed_served` fires when a third party's page — a GitHub README, a personal
 * site — requests /embed/*.svg. That request arrives through GitHub's camo
 * proxy, which sends no cookies, so there is no consent cookie to read: not
 * 'denied', absent. Default-denying would therefore drop 100% of embed
 * impressions the moment NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT flips to 1,
 * in service of a consent choice we have no mechanism to collect from a
 * reader who never visited our origin.
 *
 * The mitigating property: because camo proxies the request, the address
 * reaching us is camo's rather than the reader's, so the client_id derived in
 * analytics-server.ts collapses many readers onto one identifier. The
 * exempted event is the one least capable of identifying anybody.
 *
 * This is disclosed on /privacy under "Embedded heatmaps". If you change this
 * set, change that section in the same PR.
 */
export const CONSENT_EXEMPT_EVENTS: ReadonlySet<AnalyticsEventName> = new Set([
  ANALYTICS_EVENTS.embedServed,
]);
