export const ANALYTICS_EVENTS = {
  lookupRun: 'lookup_run',
  lookupSuccess: 'lookup_success',
  signIn: 'sign_in',
  connectProvider: 'connect_provider',
  multiAccountConnected: 'multi_account_connected',
  integratedViewUsed: 'integrated_view_used',
  timeRangeSelected: 'time_range_selected',
  embedGenerated: 'embed_generated',
  embedServed: 'embed_served',
  profileView: 'profile_view',
  proPageView: 'pro_page_view',
  proCheckoutStarted: 'pro_checkout_started',
  proCheckoutCompleted: 'pro_checkout_completed',
  teamsWaitlistSignup: 'teams_waitlist_signup',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
