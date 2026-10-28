import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth-session';
import type { NextRequest } from 'next/server';

/**
 * Downgrades the `/u/:handle` cache policy for signed-in visitors.
 *
 * `next.config.ts` marks that route `public, s-maxage=60`, which is right for
 * the anonymous case: the page is the same for every logged-out viewer. But the
 * route also renders an owner's *unpublished* profile back to them, and
 * `public` on that response lets a browser — or any intermediary that ignores
 * `Vary` — hold a copy of a page the user has explicitly marked private.
 * `s-maxage` alone does not stop this: it binds shared caches only, and with no
 * `max-age` a browser is free to pick a heuristic freshness lifetime of its own.
 *
 * The gate is cookie *presence*, not identity. Middleware cannot tell whose
 * profile is being requested without a D1 read, so every request carrying a
 * session is treated as potentially an owner preview and gets `private,
 * no-store`. The cost is small: signed-in visitors give up per-user reuse, not
 * the shared edge cache that actually carries the traffic.
 *
 * Anonymous requests are untouched and keep the `next.config.ts` header.
 *
 * Still `middleware.ts`, not `proxy.ts`, on Next.js 16 deliberately. `proxy`
 * always runs on the Node.js runtime, and OpenNext for Cloudflare does not
 * yet support Node.js middleware; edge `middleware` remains supported (with a
 * deprecation warning at build time). Rename it once OpenNext supports
 * Node.js middleware: https://opennext.js.org/cloudflare
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    response.headers.set('Cache-Control', 'private, no-store');
  }

  return response;
}

export const config = {
  matcher: '/u/:handle',
};
