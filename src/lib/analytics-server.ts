import { createHash } from 'node:crypto';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_REQUIRED,
  CONSENT_EXEMPT_EVENTS,
  parseConsentValue,
} from '@/lib/analytics-consent';
import type { AnalyticsEventName } from '@/lib/analytics-events';
import { getClientIp } from '@/lib/client-ip';
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

/**
 * Whether this request is allowed to reach GA4.
 *
 * Zaraz gates only the tools it loads in the browser. Everything below this
 * point talks to the Measurement Protocol directly, which Zaraz cannot see or
 * stop — so the gate has to live here, reading the cookie the browser wrote.
 *
 * This is checked centrally rather than at each of the call sites (the four
 * platform routes, the auth callback, the profile page, the embed renderer and
 * the analytics event route). A call site added later inherits the gate for
 * free instead of having to remember it.
 *
 * Absent consent is a decline. A visitor who has never answered has not agreed
 * to anything, so an unanswered state and a refusal are treated identically
 * here — the distinction between them only matters to the banner.
 */
function mayDeliver(request: NextRequest, eventName: AnalyticsEventName) {
  if (!ANALYTICS_CONSENT_REQUIRED) {
    return true;
  }
  if (CONSENT_EXEMPT_EVENTS.has(eventName)) {
    return true;
  }
  const raw = request.cookies.get(ANALYTICS_CONSENT_COOKIE)?.value;
  return parseConsentValue(raw) === 'granted';
}

/**
 * A stable pseudonymous identifier for GA4.
 *
 * The IP comes from `getClientIp`, which trusts `cf-connecting-ip` first. This
 * previously read the leftmost `x-forwarded-for` segment, which the caller
 * controls — meaning a visitor could supply their own header and mint as many
 * distinct client IDs as they liked. See src/lib/client-ip.ts.
 */
function toClientId(request: NextRequest) {
  const clientIp = getClientIp(request);
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
  if (!mayDeliver(request, eventName)) {
    return false;
  }

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
 * The consent check runs synchronously here, before any promise is created, so
 * a declined event costs nothing and never reaches waitUntil.
 *
 * In Workers, pending promises are cancelled when the response is returned, so
 * delivery must be registered with ctx.waitUntil(). Outside a Worker (next
 * dev, tests) getCloudflareContext() throws and we fall back to a plain
 * floating promise, which is fine in a long-lived Node process.
 */
export function trackServerEvent(
  request: NextRequest,
  eventName: AnalyticsEventName,
  params: AnalyticsParams = {},
): void {
  if (!mayDeliver(request, eventName)) {
    return;
  }

  const delivery = sendServerAnalyticsEvent(request, eventName, params);
  try {
    getCloudflareContext().ctx.waitUntil(delivery);
  } catch {
    void delivery;
  }
}
