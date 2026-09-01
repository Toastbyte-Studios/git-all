/**
 * The DOM event the footer control dispatches to reopen the consent banner.
 *
 * It lives in its own module because `Footer.tsx` is a server component and
 * `analytics-client.ts` is `'use client'` - importing the constant from there
 * would drag the whole client module into the footer's graph for the sake of
 * one string.
 */
export const CONSENT_REOPEN_EVENT = 'consent:reopen';
