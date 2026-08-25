import type { NextRequest } from 'next/server';

/**
 * The visitor's IP address, as trusted by the edge.
 *
 * `cf-connecting-ip` is set by Cloudflare on every request that reaches the
 * Worker and cannot be influenced by the caller, so it wins outright.
 *
 * The `x-forwarded-for` fallback exists for `next dev` and Vitest, where no
 * Cloudflare header is present. It takes the RIGHTMOST non-empty segment,
 * which is typically appended by the closest trusted proxy in real deployments.
 * In environments without a trusted proxy, XFF is caller-controlled and should
 * be treated as best-effort only.
 * Reading XFF[0] — as `analytics-server.ts` previously did — let any visitor
 * mint arbitrary GA4 client IDs by sending their own X-Forwarded-For header.
 * Keep both call sites on this helper so they cannot drift apart again.
 *
 * A caveat for embed traffic: `/embed/*` is fetched through GitHub's camo
 * proxy, so the address returned here is camo's, not the reader's. Embed
 * impressions therefore collapse into a small number of client IDs. That is
 * inherent to serving images cross-origin and is fine for an impression
 * counter, but do not read per-user meaning into embed_served.
 */
export function getClientIp(request: NextRequest): string {
  const cfConnectingIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const segments = (request.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments[segments.length - 1] ?? 'unknown';
}
