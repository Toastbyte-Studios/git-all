import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_CONSENT_COOKIE,
  CONSENT_EXEMPT_EVENTS,
  isAnalyticsConsentRequired,
  parseConsentValue,
} from '@/lib/analytics-consent';
import { ANALYTICS_EVENTS } from '@/lib/analytics-events';
import {
  mayTrackServerEvent,
  readConsentFromRequest,
} from '@/lib/analytics-server';

function makeRequest(consent?: string) {
  const headers: Record<string, string> = {};
  if (consent !== undefined) {
    headers['Cookie'] = `${ANALYTICS_CONSENT_COOKIE}=${consent}`;
  }
  return new NextRequest('https://gitall.app/', { headers });
}

function requireConsent(required: boolean) {
  if (required) {
    process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT = '1';
  } else {
    delete process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT;
  }
}

describe('parseConsentValue', () => {
  it('accepts the two valid values', () => {
    expect(parseConsentValue('granted')).toBe('granted');
    expect(parseConsentValue('denied')).toBe('denied');
  });

  it('rejects anything else', () => {
    expect(parseConsentValue('yes')).toBeNull();
    expect(parseConsentValue('')).toBeNull();
    expect(parseConsentValue(undefined)).toBeNull();
    expect(parseConsentValue(null)).toBeNull();
  });
});

describe('CONSENT_EXEMPT_EVENTS', () => {
  // Guard rail, not a tautology: the exemption is only defensible for embed
  // traffic, where no cookie can reach us. Widening it should require
  // deliberately editing this expectation.
  it('contains embed_served and nothing else', () => {
    expect([...CONSENT_EXEMPT_EVENTS]).toEqual([ANALYTICS_EVENTS.embedServed]);
  });
});

describe('consent gating', () => {
  const originalEnv = process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT;

  beforeEach(() => {
    requireConsent(false);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT;
    } else {
      process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT = originalEnv;
    }
    vi.restoreAllMocks();
  });

  describe('when consent is not required', () => {
    it('reports not-required regardless of cookie', () => {
      expect(readConsentFromRequest(makeRequest())).toBe('not-required');
      expect(readConsentFromRequest(makeRequest('denied'))).toBe('not-required');
    });

    it('allows every event', () => {
      expect(
        mayTrackServerEvent(makeRequest('denied'), ANALYTICS_EVENTS.lookupRun),
      ).toBe(true);
    });
  });

  describe('when consent is required', () => {
    beforeEach(() => {
      requireConsent(true);
    });

    it('reflects the flag', () => {
      expect(isAnalyticsConsentRequired()).toBe(true);
    });

    it('reads granted and denied from the cookie', () => {
      expect(readConsentFromRequest(makeRequest('granted'))).toBe('granted');
      expect(readConsentFromRequest(makeRequest('denied'))).toBe('denied');
    });

    it('reports null when the visitor has not chosen', () => {
      expect(readConsentFromRequest(makeRequest())).toBeNull();
    });

    it('allows a non-exempt event only when granted', () => {
      expect(
        mayTrackServerEvent(makeRequest('granted'), ANALYTICS_EVENTS.lookupRun),
      ).toBe(true);
    });

    it('blocks a non-exempt event when denied', () => {
      expect(
        mayTrackServerEvent(makeRequest('denied'), ANALYTICS_EVENTS.lookupRun),
      ).toBe(false);
    });

    it('treats an absent cookie as denied, not as permission', () => {
      expect(
        mayTrackServerEvent(makeRequest(), ANALYTICS_EVENTS.lookupRun),
      ).toBe(false);
    });

    it('treats a malformed cookie as denied', () => {
      expect(
        mayTrackServerEvent(makeRequest('maybe'), ANALYTICS_EVENTS.lookupRun),
      ).toBe(false);
    });

    it('allows embed_served with no cookie at all', () => {
      // The camo case: a README reader whose request carries no cookies.
      expect(
        mayTrackServerEvent(makeRequest(), ANALYTICS_EVENTS.embedServed),
      ).toBe(true);
    });

    it('allows embed_served even when consent is denied', () => {
      expect(
        mayTrackServerEvent(makeRequest('denied'), ANALYTICS_EVENTS.embedServed),
      ).toBe(true);
    });
  });
});
