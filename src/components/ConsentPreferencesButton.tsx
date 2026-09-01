'use client';

import { getAnalyticsConsentRequirement } from '@/lib/analytics-client';
import { CONSENT_REOPEN_EVENT } from '@/lib/analytics-consent-events';

/**
 * Footer control that reopens the consent banner.
 *
 * Withdrawing consent has to be as easy as giving it, and a visitor who
 * declined never sees the banner again on its own - this is their only way
 * back to it.
 *
 * Renders nothing when consent is not required. That check reads a build-time
 * constant rather than a cookie, so when the flag is off this compiles down to
 * a component that returns null, and when it is on the markup is identical for
 * every viewer. Both matter for the edge cache on `/u/[handle]` - see Footer.
 */
export function ConsentPreferencesButton() {
  if (!getAnalyticsConsentRequirement()) {
    return null;
  }

  return (
    <>
      {' \u00b7 '}
      <button
        type="button"
        onClick={() => {
          document.dispatchEvent(new Event(CONSENT_REOPEN_EVENT));
        }}
        className="hover:underline cursor-pointer"
        style={{ color: 'var(--text-secondary)' }}
      >
        Cookie preferences
      </button>
    </>
  );
}
