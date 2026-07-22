import { createHash } from 'node:crypto';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { AnalyticsEventName } from '@/lib/analytics-events';
import type { NextRequest } from 'next/server';

type AnalyticsParams = Record<
  string,
  string | number | boolean | null | undefined
>;

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

function getGa4Config() {
  const measurementId = process.env.ANALYTICS_GA4_MEASUREMENT_ID?.trim();
  const apiSecret = process.env.ANALYTICS_GA4_API_SECRET?.trim();
  if (!measurementId || !apiSecret) {
    return null;
  }
  return { measurementId, apiSecret };
}

function toClientId(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  const clientIp = forwardedFor.split(',')[0]?.trim() ?? '';
  const userAgent = request.headers.get('user-agent') ?? '';
  const acceptLanguage = request.headers.get('accept-language') ?? '';
  const seed = `${clientIp}|${userAgent}|${acceptLanguage}`;
  const digest = createHash('sha256').update(seed).digest('hex');
  return `${digest.slice(0, 10)}.${digest.slice(10, 20)}`;
}

function sanitizeParamKey(value: string) {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_');
  if (!normalized) {
    return null;
  }

  const withPrefix =
    /^[a-zA-Z]/.test(normalized) && !normalized.startsWith('ga_')
      ? normalized
      : `p_${normalized}`;
  return withPrefix.slice(0, 40);
}

function sanitizeParams(params: AnalyticsParams) {
  const entries: Array<[string, string | number]> = [];

  for (const [key, rawValue] of Object.entries(params)) {
    if (rawValue === undefined || rawValue === null) {
      continue;
    }
    const sanitizedKey = sanitizeParamKey(key);
    if (!sanitizedKey) {
      continue;
    }

    const value = typeof rawValue === 'boolean' ? (rawValue ? 1 : 0) : rawValue;
    entries.push([sanitizedKey, value]);

    if (entries.length >= 25) {
      break;
    }
  }

  return Object.fromEntries(entries);
}

export async function sendServerAnalyticsEvent(
  request: NextRequest,
  eventName: AnalyticsEventName,
  params: AnalyticsParams = {},
) {
  const config = getGa4Config();
  if (!config) {
    return false;
  }

  const eventParams = {
    ...sanitizeParams(params),
    engagement_time_msec: 1,
  };

  try {
    const response = await fetch(
      `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(config.measurementId)}&api_secret=${encodeURIComponent(config.apiSecret)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5_000),
        body: JSON.stringify({
          client_id: toClientId(request),
          non_personalized_ads: true,
          events: [
            {
              name: eventName,
              params: eventParams,
            },
          ],
        }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fire an analytics event without blocking the response.
 *
 * In Workers, pending promises are cancelled when the response is returned,
 * so delivery must be registered with ctx.waitUntil(). Outside a Worker
 * (next dev, tests) getCloudflareContext() throws and we fall back to a
 * plain floating promise, which is fine in a long-lived Node process.
 */
export function trackServerEvent(
  request: NextRequest,
  eventName: AnalyticsEventName,
  params: AnalyticsParams = {},
): void {
  const delivery = sendServerAnalyticsEvent(request, eventName, params);
  try {
    getCloudflareContext().ctx.waitUntil(delivery);
  } catch {
    void delivery;
  }
}
