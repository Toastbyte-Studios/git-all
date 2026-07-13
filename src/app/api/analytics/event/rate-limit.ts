import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const MAX_RATE_LIMIT_ENTRIES = 10_000;

// Per-process/per-instance map — not shared across Worker instances and resets on cold starts.
// This provides best-effort throttling only; a global limit would require Workers KV or a Durable Object.
const rateLimitMap = new Map<string, number[]>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  // Use the last non-empty segment: in common proxy setups the rightmost entry is
  // appended by the closest trusted proxy and cannot be spoofed by the client.
  const segments = forwarded
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return segments[segments.length - 1] ?? 'unknown';
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
  // The Map is insertion-ordered; delete the first (oldest-inserted) key in O(1)
  // until we are within the cap.
  while (rateLimitMap.size > maxEntries) {
    const firstKey = rateLimitMap.keys().next().value;
    if (firstKey === undefined) {
      break;
    }
    rateLimitMap.delete(firstKey);
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
