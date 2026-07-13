import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const MAX_RATE_LIMIT_ENTRIES = 10_000;

const rateLimitMap = new Map<string, number[]>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0]?.trim() || 'unknown';
}

function pruneStaleEntries(windowStart: number) {
  for (const [key, timestamps] of rateLimitMap.entries()) {
    const kept = timestamps.filter((timestamp) => timestamp > windowStart);
    if (kept.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, kept);
    }
  }
}

function evictOldestEntries(maxEntries: number) {
  while (rateLimitMap.size > maxEntries) {
    let oldestKey: string | undefined;
    let oldestTimestamp = Number.POSITIVE_INFINITY;

    for (const [key, timestamps] of rateLimitMap.entries()) {
      const firstTimestamp = timestamps[0];
      if (firstTimestamp !== undefined && firstTimestamp < oldestTimestamp) {
        oldestKey = key;
        oldestTimestamp = firstTimestamp;
      }
    }

    if (!oldestKey) {
      break;
    }

    rateLimitMap.delete(oldestKey);
  }
}

export function checkRateLimit(request: NextRequest): boolean {
  const ip = getClientIp(request);
  const key = createHash('sha256').update(ip).digest('hex').slice(0, 16);
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  const timestamps = rateLimitMap.get(key) ?? [];
  const recent = timestamps.filter((timestamp) => timestamp > windowStart);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitMap.set(key, recent);
    return false;
  }

  recent.push(now);
  rateLimitMap.set(key, recent);

  if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
    pruneStaleEntries(windowStart);
    evictOldestEntries(MAX_RATE_LIMIT_ENTRIES);
  }

  return true;
}

/** Clears rate-limit state. Exposed for unit tests only. */
export function _resetRateLimitForTest() {
  rateLimitMap.clear();
}

export function _getRateLimitMapSizeForTest() {
  return rateLimitMap.size;
}
