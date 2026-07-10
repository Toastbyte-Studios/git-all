import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../route';

function makeRequest(
  body: unknown,
  options: { contentType?: string; origin?: string | null } = {},
) {
  const { contentType = 'application/json', origin = 'https://gitall.app' } =
    options;
  const headers: Record<string, string> = {};
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  if (origin !== null) {
    headers['Origin'] = origin;
  }
  return new NextRequest('https://gitall.app/api/analytics/event', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/analytics/event', () => {
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
});
