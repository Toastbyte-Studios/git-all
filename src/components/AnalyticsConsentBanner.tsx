'use client';

import { useEffect, useState } from 'react';
import {
  getAnalyticsConsentRequirement,
  readAnalyticsConsent,
  setAnalyticsConsent,
} from '@/lib/analytics-client';

export function AnalyticsConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getAnalyticsConsentRequirement()) {
      return;
    }

    setVisible(readAnalyticsConsent() === null);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:w-[420px] z-50 rounded-lg p-4 text-sm shadow-lg"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-secondary)',
      }}
    >
      <p>
        We use privacy-first analytics to improve GitAll. You can accept or
        decline analytics tracking.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setAnalyticsConsent(false);
            setVisible(false);
          }}
          className="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer"
          style={{
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => {
            setAnalyticsConsent(true);
            setVisible(false);
          }}
          className="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--bg)',
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
