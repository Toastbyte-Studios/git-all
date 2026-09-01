'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getAnalyticsConsentRequirement,
  initAnalyticsConsentBridge,
  readAnalyticsConsent,
  setAnalyticsConsent,
} from '@/lib/analytics-client';
import { CONSENT_REOPEN_EVENT } from '@/lib/analytics-consent-events';

/**
 * Consent banner.
 *
 * Replaces the stock Cloudflare Zaraz consent modal. Requires "Show consent
 * modal" to be DISABLED in the Zaraz dashboard (Consent settings) while
 * "Enable Consent Management" stays ENABLED - otherwise this and the Zaraz
 * modal both appear. That double-banner scenario is what issue #148 was
 * worried about; the answer is that only one of the two is ever switched on.
 *
 * Shown only when `readAnalyticsConsent()` returns null, meaning consent is
 * required and the visitor has not answered. A recorded 'denied' does not
 * bring it back - the footer control reopens it for anyone who changes their
 * mind.
 *
 * Accept and Decline are given equal visual weight on purpose. Making refusal
 * harder than acceptance is the specific pattern regulators have fined people
 * for, and it is not worth the handful of extra sessions.
 */
export function AnalyticsConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getAnalyticsConsentRequirement()) {
      return;
    }

    // Mirrors the Zaraz consent choice into the `analytics-consent` cookie so
    // the Measurement Protocol path in analytics-server.ts sees the same
    // decision. Safe before Zaraz has loaded; a no-op if it never does.
    initAnalyticsConsentBridge();

    // 'not-required' means the flag is off. 'granted' and 'denied' are both
    // answered. Only null opens the banner.
    setVisible(readAnalyticsConsent() === null);

    // The bridge runs asynchronously and may backfill the cookie after the
    // line above has already decided to show the banner - a returning visitor
    // whose Zaraz choice predates this code, for instance. Re-check once the
    // Zaraz Consent API is ready so the banner closes if a choice exists.
    const hideIfAnswered = () => {
      if (readAnalyticsConsent() !== null) {
        setVisible(false);
      }
    };

    const reopen = () => setVisible(true);

    document.addEventListener('zarazConsentAPIReady', hideIfAnswered);
    document.addEventListener('zarazConsentChoicesUpdated', hideIfAnswered);
    document.addEventListener(CONSENT_REOPEN_EVENT, reopen);

    return () => {
      document.removeEventListener('zarazConsentAPIReady', hideIfAnswered);
      document.removeEventListener(
        'zarazConsentChoicesUpdated',
        hideIfAnswered,
      );
      document.removeEventListener(CONSENT_REOPEN_EVENT, reopen);
    };
  }, []);

  const choose = useCallback((granted: boolean) => {
    // Writes the `analytics-consent` cookie and calls zaraz.consent.setAll, so
    // the Zaraz tools and the server-side path act on the same decision.
    setAnalyticsConsent(granted);

    if (granted) {
      // Pageview events Zaraz withheld while consent was absent. Without this
      // the first pageview of the session is lost.
      try {
        window.zaraz?.consent?.sendQueuedEvents?.();
      } catch {
        // no-op
      }
    }

    setVisible(false);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-banner-title"
      aria-describedby="consent-banner-body"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:w-[440px] z-50 rounded-lg p-4 shadow-lg"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      <p
        id="consent-banner-title"
        className="text-sm font-medium"
        style={{ color: 'var(--text-primary)' }}
      >
        Cookies for analytics
      </p>
      <p
        id="consent-banner-body"
        className="mt-1.5 text-xs leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        Counts visits and records which pages and features get used, through
        Google Analytics. We do not send your GitHub, GitLab, Bitbucket, or
        Gitea username, and nothing here feeds advertising profiles. Decline and
        the site works exactly the same.{' '}
        <a
          href="/privacy"
          className="hover:underline"
          style={{ color: 'var(--accent)' }}
        >
          Privacy
        </a>
      </p>
      {/*
        Both buttons carry the same class list and the same style object.
        Accept is not styled as the primary call to action, so neither choice
        is nudged. Do not "fix" this by making Accept the accent colour.
      */}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => choose(false)}
          className="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer"
          style={{
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => choose(true)}
          className="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer"
          style={{
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
