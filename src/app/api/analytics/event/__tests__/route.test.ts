import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetRateLimitForTest, POST } from '../route';

function makeRequest(
  body: unknown,
  options: {
    contentType?: string;
    origin?: string | null;
    ip?: string;
  } = {},
) {
  const {
    contentType = 'application/json',
    origin = 'https://gitall.app',
    ip,
  } = options;
  const headers: Record<string, string> = {};
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  if (origin !== null) {
    headers['Origin'] = origin;
  }
  if (ip) {
    headers['X-Forwarded-For'] = ip;
  }
  return new NextRequest('https://gitall.app/api/analytics/event', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/analytics/event', () => {
  beforeEach(() => {
    _resetRateLimitForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 415 when Content-Type is not application/json', async () => {
    const response = await POST(
      makeRequest({ eventName: 'lookup_run' }, { contentType: 'text/plain' }),
    );
    expect(response.status).toBe(415);
  });

  it('returns 403 when Origin header is absent', async () => {
    const response = await POST(
      makeRequest({ eventName: 'lookup_run' }, { origin: null }),
    );
    expect(response.status).toBe(403);
  });

  it('returns 403 when Origin does not match the request origin', async () => {
    const response = await POST(
      makeRequest(
        { eventName: 'lookup_run' },
        { origin: 'https://evil.example.com' },
      ),
    );
    expect(response.status).toBe(403);
  });

  it('returns 400 when eventName is missing', async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it('returns 400 when eventName is not in the allowed list', async () => {
    const response = await POST(makeRequest({ eventName: 'not_a_real_event' }));
    expect(response.status).toBe(400);
  });

  it('returns 200 and calls sendServerAnalyticsEvent for a valid event', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      makeRequest({ eventName: 'lookup_run', params: { platform: 'github' } }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it('strips non-primitive values from params before forwarding', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    process.env.ANALYTICS_GA4_MEASUREMENT_ID = 'G-TEST';
    process.env.ANALYTICS_GA4_API_SECRET = 'secret';

    const response = await POST(
      makeRequest({
        eventName: 'lookup_run',
        params: {
          valid_string: 'hello',
          valid_number: 42,
          valid_bool: true,
          object_value: { nested: true },
          array_value: [1, 2, 3],
        },
      }),
    );

    expect(response.status).toBe(200);
    const body = (await fetchMock.mock.calls[0]?.[1]?.body) as string;
    const payload = JSON.parse(body) as {
      events: Array<{ params: Record<string, unknown> }>;
    };
    const eventParams = payload.events[0]?.params ?? {};
    expect(eventParams).toHaveProperty('valid_string', 'hello');
    expect(eventParams).toHaveProperty('valid_number', 42);
    expect(eventParams).toHaveProperty('valid_bool', 1);
    expect(eventParams).not.toHaveProperty('object_value');
    expect(eventParams).not.toHaveProperty('array_value');

    delete process.env.ANALYTICS_GA4_MEASUREMENT_ID;
    delete process.env.ANALYTICS_GA4_API_SECRET;
  });

  describe('rate limiting', () => {
    it('returns 200 for requests within the rate limit', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response('', { status: 200 })),
      );

      const response = await POST(
        makeRequest({ eventName: 'lookup_run' }, { ip: '203.0.113.1' }),
      );
      expect(response.status).toBe(200);
    });

    it('returns 429 after exceeding 20 requests per minute from the same IP', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response('', { status: 200 })),
      );

      for (let i = 0; i < 20; i++) {
        const res = await POST(
          makeRequest({ eventName: 'lookup_run' }, { ip: '203.0.113.2' }),
        );
        expect(res.status).toBe(200);
      }

      const limited = await POST(
        makeRequest({ eventName: 'lookup_run' }, { ip: '203.0.113.2' }),
      );
      expect(limited.status).toBe(429);
      expect(limited.headers.get('Retry-After')).toBe('60');
    });

    it('does not rate limit a different IP', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response('', { status: 200 })),
      );

      for (let i = 0; i < 20; i++) {
        await POST(
          makeRequest({ eventName: 'lookup_run' }, { ip: '203.0.113.3' }),
        );
      }

      // A request from a different IP should still succeed.
      const response = await POST(
        makeRequest({ eventName: 'lookup_run' }, { ip: '203.0.113.4' }),
      );
      expect(response.status).toBe(200);
    });

    it('allows requests again after the window expires', async () => {
      vi.useFakeTimers();
      vi.stubGlobal(
        'fetch',
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response('', { status: 200 })),
      );

      for (let i = 0; i < 20; i++) {
        await POST(
          makeRequest({ eventName: 'lookup_run' }, { ip: '203.0.113.5' }),
        );
      }

      // Verify limit is hit.
      const limited = await POST(
        makeRequest({ eventName: 'lookup_run' }, { ip: '203.0.113.5' }),
      );
      expect(limited.status).toBe(429);

      // Advance time past the 60-second window.
      vi.advanceTimersByTime(61_000);

      const allowed = await POST(
        makeRequest({ eventName: 'lookup_run' }, { ip: '203.0.113.5' }),
      );
      expect(allowed.status).toBe(200);

      vi.useRealTimers();
    });
  });
});
