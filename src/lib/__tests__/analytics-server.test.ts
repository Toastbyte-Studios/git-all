import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_CONSENT_COOKIE } from '@/lib/analytics-consent';
import { ANALYTICS_EVENTS } from '@/lib/analytics-events';
import {
  sendServerAnalyticsEvent,
  trackServerEvent,
} from '@/lib/analytics-server';

// Top-level mock so it is hoisted before any module imports
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(),
}));

const ORIGINAL_ENV = {
  ANALYTICS_GA4_MEASUREMENT_ID: process.env.ANALYTICS_GA4_MEASUREMENT_ID,
  ANALYTICS_GA4_API_SECRET: process.env.ANALYTICS_GA4_API_SECRET,
  NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT:
    process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
});

describe('sendServerAnalyticsEvent', () => {
  it('no-ops when GA4 credentials are not configured', async () => {
    delete process.env.ANALYTICS_GA4_MEASUREMENT_ID;
    delete process.env.ANALYTICS_GA4_API_SECRET;

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendServerAnalyticsEvent(
      new NextRequest('https://gitall.app/api/github?username=octocat'),
      ANALYTICS_EVENTS.lookupSuccess,
      { provider: 'github' },
    );

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts sanitized event payloads to GA4 measurement protocol', async () => {
    process.env.ANALYTICS_GA4_MEASUREMENT_ID = 'G-TEST123';
    process.env.ANALYTICS_GA4_API_SECRET = 'secret-123';

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendServerAnalyticsEvent(
      new NextRequest('https://gitall.app/api/github?username=octocat', {
        headers: {
          'x-forwarded-for': '203.0.113.10',
          'user-agent': 'vitest',
          'accept-language': 'en-US',
        },
      }),
      ANALYTICS_EVENTS.lookupSuccess,
      {
        provider: 'github',
        'cache-status': 'hit',
        ignored: undefined,
        boolValue: true,
      },
    );

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain(
      'https://www.google-analytics.com/mp/collect?measurement_id=G-TEST123&api_secret=secret-123',
    );
    const body = JSON.parse(String(options?.body)) as {
      client_id: string;
      events: Array<{ name: string; params: Record<string, string | number> }>;
    };
    expect(body.client_id).toContain('.');
    expect(body.events[0]?.name).toBe(ANALYTICS_EVENTS.lookupSuccess);
    expect(body.events[0]?.params).toMatchObject({
      provider: 'github',
      cache_status: 'hit',
      boolValue: 1,
      engagement_time_msec: 1,
    });
    expect(body.events[0]?.params).not.toHaveProperty('ignored');
  });

  it('derives a stable client_id from the trusted IP, ignoring a spoofed leftmost XFF segment', async () => {
    process.env.ANALYTICS_GA4_MEASUREMENT_ID = 'G-TEST123';
    process.env.ANALYTICS_GA4_API_SECRET = 'secret-123';

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendServerAnalyticsEvent(
      new NextRequest('https://gitall.app/api/github?username=octocat', {
        headers: {
          'x-forwarded-for': 'attacker-chosen, 203.0.113.10',
          'user-agent': 'vitest',
          'accept-language': 'en-US',
        },
      }),
      ANALYTICS_EVENTS.lookupSuccess,
      { provider: 'github' },
    );
    await sendServerAnalyticsEvent(
      new NextRequest('https://gitall.app/api/github?username=octocat', {
        headers: {
          'x-forwarded-for': '203.0.113.10',
          'user-agent': 'vitest',
          'accept-language': 'en-US',
        },
      }),
      ANALYTICS_EVENTS.lookupSuccess,
      { provider: 'github' },
    );

    const firstBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as { client_id: string };
    const secondBody = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body),
    ) as { client_id: string };

    expect(firstBody.client_id).toBe(secondBody.client_id);
  });
});

describe('trackServerEvent', () => {
  it('registers delivery with ctx.waitUntil() when a Cloudflare context is present', async () => {
    process.env.ANALYTICS_GA4_MEASUREMENT_ID = 'G-TEST123';
    process.env.ANALYTICS_GA4_API_SECRET = 'secret-123';

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const waitUntilMock = vi.fn<(p: Promise<unknown>) => void>();
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    vi.mocked(getCloudflareContext).mockReturnValue({
      ctx: { waitUntil: waitUntilMock } as unknown as {
        waitUntil(p: Promise<unknown>): void;
      },
      env: {} as CloudflareEnv,
      cf: {} as Record<string, unknown>,
    } as unknown as ReturnType<typeof getCloudflareContext>);

    const request = new NextRequest(
      'https://gitall.app/api/github?username=octocat',
      {
        headers: {
          'x-forwarded-for': '203.0.113.10',
          'user-agent': 'vitest',
          'accept-language': 'en-US',
        },
      },
    );

    trackServerEvent(request, ANALYTICS_EVENTS.lookupSuccess, {
      provider: 'github',
    });

    expect(waitUntilMock).toHaveBeenCalledTimes(1);
    const deliveryArg = waitUntilMock.mock.calls[0]?.[0];
    expect(deliveryArg).toBeInstanceOf(Promise);

    // Ensure the underlying fetch actually runs when the promise settles
    await deliveryArg;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not throw and fires a floating promise when no Cloudflare context is available', async () => {
    process.env.ANALYTICS_GA4_MEASUREMENT_ID = 'G-TEST123';
    process.env.ANALYTICS_GA4_API_SECRET = 'secret-123';

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    vi.mocked(getCloudflareContext).mockImplementation(() => {
      throw new Error('Not a Cloudflare Worker');
    });

    const request = new NextRequest(
      'https://gitall.app/api/github?username=octocat',
      {
        headers: {
          'x-forwarded-for': '203.0.113.10',
          'user-agent': 'vitest',
          'accept-language': 'en-US',
        },
      },
    );

    expect(() =>
      trackServerEvent(request, ANALYTICS_EVENTS.lookupSuccess, {
        provider: 'github',
      }),
    ).not.toThrow();

    // Allow the floating promise to settle
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('consent gating (mayDeliver)', () => {
  // ANALYTICS_CONSENT_REQUIRED is read once at module import time, so each
  // scenario resets modules and re-imports with the env var already set.
  async function loadWithConsentRequired() {
    vi.resetModules();
    process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT = '1';
    return import('@/lib/analytics-server');
  }

  function requestWithConsentCookie(value?: string) {
    return new NextRequest('https://gitall.app/api/github?username=octocat', {
      headers: {
        'x-forwarded-for': '203.0.113.10',
        'user-agent': 'vitest',
        'accept-language': 'en-US',
        ...(value ? { cookie: `${ANALYTICS_CONSENT_COOKIE}=${value}` } : {}),
      },
    });
  }

  it('denies delivery when no consent cookie is present', async () => {
    process.env.ANALYTICS_GA4_MEASUREMENT_ID = 'G-TEST123';
    process.env.ANALYTICS_GA4_API_SECRET = 'secret-123';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { sendServerAnalyticsEvent: send } = await loadWithConsentRequired();

    const result = await send(
      requestWithConsentCookie(),
      ANALYTICS_EVENTS.lookupSuccess,
      { provider: 'github' },
    );

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('denies delivery when the consent cookie is denied', async () => {
    process.env.ANALYTICS_GA4_MEASUREMENT_ID = 'G-TEST123';
    process.env.ANALYTICS_GA4_API_SECRET = 'secret-123';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { sendServerAnalyticsEvent: send } = await loadWithConsentRequired();

    const result = await send(
      requestWithConsentCookie('denied'),
      ANALYTICS_EVENTS.lookupSuccess,
      { provider: 'github' },
    );

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows delivery when the consent cookie is granted', async () => {
    process.env.ANALYTICS_GA4_MEASUREMENT_ID = 'G-TEST123';
    process.env.ANALYTICS_GA4_API_SECRET = 'secret-123';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { sendServerAnalyticsEvent: send } = await loadWithConsentRequired();

    const result = await send(
      requestWithConsentCookie('granted'),
      ANALYTICS_EVENTS.lookupSuccess,
      { provider: 'github' },
    );

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows delivery of exempt events regardless of consent state', async () => {
    process.env.ANALYTICS_GA4_MEASUREMENT_ID = 'G-TEST123';
    process.env.ANALYTICS_GA4_API_SECRET = 'secret-123';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { sendServerAnalyticsEvent: send } = await loadWithConsentRequired();

    const result = await send(
      requestWithConsentCookie(),
      ANALYTICS_EVENTS.embedServed,
      { provider: 'github' },
    );

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
