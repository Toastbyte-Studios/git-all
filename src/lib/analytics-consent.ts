import { ANALYTICS_EVENTS, type AnalyticsEventName } from './analytics-events';

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

/**
 * SameSite for the `analytics-consent` cookie.
 *
 * MUST STAY 'Lax'. Zaraz's own `zaraz-consent` cookie is Strict, and copying
 * that here would break the server-side gate: an OAuth callback from GitHub,
 * GitLab or Bitbucket is a cross-site top-level navigation, and a Strict
 * cookie is not sent on one. `sign_in` and `connect_provider` fire from
 * `api/auth/callback/[provider]` on exactly that request, so the server would
 * read "no cookie", treat it as unanswered, and silently drop every sign-in
 * conversion from a consenting visitor.
 *
 * The cookie is also deliberately NOT HttpOnly — the banner has to read it to
 * know whether to show, and write it when clicked. It holds one enum value and
 * never an identifier.
 */
export const ANALYTICS_CONSENT_SAME_SITE = 'Lax';

export type ConsentValue = 'granted' | 'denied';

/**
 * `null` means the visitor has not chosen yet — distinct from 'denied'.
 * When consent is required, absent must be treated as denied for tracking
 * purposes but as unanswered for banner purposes.
 */
export type ConsentState = ConsentValue | 'not-required' | null;

/**
 * `NEXT_PUBLIC_*` is inlined into the client bundle when the build runs, and
 * read at runtime by server code. On this repo the build runs in GitHub
 * Actions (`.github/workflows/deploy.yml` -> `npm run cf:build`) while
 * `wrangler deploy` only uploads the finished output.
 *
 * Setting this in the Cloudflare dashboard therefore has NO effect on the
 * client bundle — it must be set in the workflow environment. This exact trap
 * shipped an invisible banner on alley-admin for a full deploy cycle.
 */
export const ANALYTICS_CONSENT_REQUIRED =
  process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT === '1';

/**
 * Zaraz's own record of the visitor's choice. Only the PRESENCE of one of
 * these is read, never the contents: the format is not a documented contract
 * and the keys are per-zone random purpose IDs. On gitall.app the value was
 * observed as `{"KikK":true}` on 2026-09-01 — `KikK` is this zone's Analytics
 * purpose ID and will differ on every other zone.
 *
 * `zaraz.consent.getAll()` is the supported way to read the actual decision.
 *
 * The name is configurable per zone in the Zaraz dashboard under Consent.
 * gitall.app and alleyadmin.app both use `zaraz-consent`; `cf_consent` is
 * Cloudflare's documented default and is kept for zones not yet checked.
 * Extend this list rather than editing it if another zone differs again.
 */
export const ZARAZ_CONSENT_COOKIES = ['zaraz-consent', 'cf_consent'] as const;

export function parseConsentValue(
  raw: string | null | undefined,
): ConsentValue | null {
  return raw === 'granted' || raw === 'denied' ? raw : null;
}

/**
 * Events delivered even when consent is absent or denied.
 *
 * Unlike alley-admin, where this set is empty and must stay empty, GitAll has
 * one event that genuinely cannot be gated: `embed_served`.
 *
 * `/embed/[slug]/route.ts` serves an image into a third party's README or
 * site. The visitor never loads gitall.app, so no consent cookie exists to
 * read, and on the GitHub path the request arrives from the camo image proxy —
 * meaning the IP that `analytics-server.ts` hashes belongs to camo, not to a
 * person. Gating it would not protect anyone; it would silence the event
 * permanently.
 *
 * That reasoning is weaker for a direct <img> embed on someone's personal
 * site, where the visitor's own browser fetches the image and their real IP is
 * what gets hashed. Empty this set if you would rather lose embed impressions
 * than carry that; nothing else depends on it being non-empty.
 */
export const CONSENT_EXEMPT_EVENTS: ReadonlySet<AnalyticsEventName> = new Set([
  ANALYTICS_EVENTS.embedServed,
]);
