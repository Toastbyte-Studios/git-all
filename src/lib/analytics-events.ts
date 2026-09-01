/**
 * The analytics event catalog.
 *
 * ONE RULE: every name in here has a call site. A declared-but-unfired event
 * is not harmless documentation of intent — `ALLOWED_EVENTS` in
 * `src/app/api/analytics/event/route.ts` accepts anything in this object, so
 * an unused name is an open endpoint that any caller can POST to. It also
 * misleads the privacy policy, which describes what we send to GA4 by reading
 * this list.
 *
 * Four names were removed on 2026-09-01 — pro_page_view, pro_checkout_started,
 * pro_checkout_completed and teams_waitlist_signup. There is no /pro route, no
 * /teams route and no checkout anywhere in src/app. They described a product
 * that does not exist. Add them back in the same commit that builds the
 * feature, not before.
 *
 * Params must stay non-identifying. The privacy policy commits, in bold, to
 * never sending a handle, a username or a provider account ID. Counts, enums
 * and booleans only.
 */
export const ANALYTICS_EVENTS = {
  // Lookup
  lookupRun: 'lookup_run',
  lookupSuccess: 'lookup_success',
  timeRangeSelected: 'time_range_selected',
  integratedViewUsed: 'integrated_view_used',

  // Account
  signIn: 'sign_in',
  connectProvider: 'connect_provider',
  multiAccountConnected: 'multi_account_connected',
  providerDisconnected: 'provider_disconnected',
  handleChanged: 'handle_changed',
  accountDeleted: 'account_deleted',

  // Profile
  profileView: 'profile_view',
  profilePublished: 'profile_published',
  profileUnpublished: 'profile_unpublished',

  // Embed
  embedGenerated: 'embed_generated',
  embedServed: 'embed_served',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
