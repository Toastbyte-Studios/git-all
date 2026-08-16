import type { NextConfig } from 'next';
import { version } from './package.json';

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    // Exposed at build time so the footer can display the current app version.
    // Sourced from package.json so it stays in sync with every release.
    NEXT_PUBLIC_APP_VERSION: version,
  },
  images: {
    remotePatterns: [
      // GitHub avatars
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      // GitLab uploaded avatars
      {
        protocol: 'https',
        hostname: 'gitlab.com',
      },
      // Gravatar fallback — GitLab and Bitbucket serve Gravatar URLs when a
      // user has no custom avatar (Bitbucket avatar hrefs are frequently these).
      {
        protocol: 'https',
        hostname: 'secure.gravatar.com',
      },
      // Bitbucket / Atlassian avatar CDN. Region varies (e.g. us-west-2), so
      // match any subdomain of the Atlassian avatar host.
      {
        protocol: 'https',
        hostname: '**.atl-paas.net',
      },
    ],
  },
  // Next streams resolved metadata into the end of the <body> and only falls
  // back to a blocking head render for user agents matching this pattern
  // (by default: Googlebot, the social scrapers, `Chrome-Lighthouse`, ...).
  // The intent is a faster first flush, and the cost is that anything NOT on
  // that list — every ordinary browser, every scraper Next has not enumerated,
  // and, as it turns out, at least some Lighthouse builds — receives HTML whose
  // head contains no description, no canonical, and no og:/twitter: tags. That
  // is what the "Document does not have a meta description" audit was reporting:
  // not a missing tag, a tag in the wrong element.
  //
  // Matching every UA opts the whole app back into a blocking metadata render.
  // The cost is bounded: `/` resolves its metadata synchronously, and the one
  // route with an async generateMetadata (`/u/[handle]`) awaits a D1 read that
  // the page body already awaits, so the shell flush waits on nothing new.
  // Correct head tags for every client are worth more here than an early flush.
  htmlLimitedBots: /.*/,
  async headers() {
    return [
      {
        // Applies to every route. Individual entries below can add to this;
        // Next merges header sets rather than replacing them.
        source: '/:path*',
        headers: [
          // A year, with subdomains. `preload` is deliberately absent: it is
          // effectively irreversible once submitted to the browser preload
          // list, and it would bind every current and future *.gitall.app
          // subdomain to HTTPS-only. That is an owner decision, not a
          // Lighthouse one — add it once the subdomain inventory is confirmed.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Clickjacking protection, enforced. Nothing in the app frames
          // itself: the embed is consumed as an <img>, which XFO does not
          // affect. Kept as XFO rather than CSP frame-ancestors because the
          // CSP below is report-only for now.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // The app needs none of these. Denying the ad-tech surface also
          // shuts off the Shared Storage / Protected Audience calls that the
          // Cloudflare Zaraz bundle makes, which are what the "uses deprecated
          // APIs" audit is reporting.
          {
            key: 'Permissions-Policy',
            value: [
              'accelerometer=()',
              'camera=()',
              'geolocation=()',
              'gyroscope=()',
              'magnetometer=()',
              'microphone=()',
              'payment=()',
              'usb=()',
              'browsing-topics=()',
              'interest-cohort=()',
              'join-ad-interest-group=()',
              'run-ad-auction=()',
              'shared-storage=()',
              'shared-storage-select-url=()',
              'attribution-reporting=()',
            ].join(', '),
          },
          // REPORT-ONLY, on purpose.
          //
          // This policy cannot be fully validated from the repo: Cloudflare
          // Zaraz injects scripts from a dashboard config that is not in
          // version control, so an enforcing policy risks silently breaking
          // analytics — or the page — on deploy. Report-only lets the real
          // traffic tell us what the policy would have blocked first.
          //
          // Promoting it is a one-line change (drop the `-Report-Only`) once
          // the violation reports are clean.
          //
          // Note the two `'unsafe-inline'` entries. Both are load-bearing:
          // the theme-flash script and Next's own bootstrap are inline, and
          // the components style themselves with inline `style={{...}}`. The
          // alternative is per-request nonces, which would force every route
          // to render dynamically and give up the edge caching that
          // `/u/[handle]` is built around. Trusted Types is omitted for the
          // same reason — React and Next are not Trusted-Types-clean here.
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "frame-src 'none'",
              "form-action 'self'",
              "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              "img-src 'self' data: blob: https://avatars.githubusercontent.com https://gitlab.com https://secure.gravatar.com https://*.atl-paas.net",
              "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com",
              'upgrade-insecure-requests',
            ].join('; '),
          },
        ],
      },
      {
        // Public profile pages are rendered from D1 and are broadly cacheable,
        // but they are no longer identical for every viewer: the route reads
        // the session cookie so an owner can preview their own private profile.
        // `Vary: Cookie` is what stops a shared cache from serving that private
        // view to an anonymous visitor. Anonymous visitors send no session
        // cookie, so they still share a single cache entry.
        //
        // s-maxage is deliberately short. A profile switched to private, or an
        // account deleted outright, must stop resolving quickly — 900s fresh
        // plus 3600s stale-while-revalidate meant someone could click "delete
        // my account" and still find their page served for the best part of an
        // hour. 60s with no stale window keeps that to something defensible.
        //
        // Cache purge by URL was considered and rejected: Cloudflare does not
        // populate its edge cache from `s-maxage` on a Worker-generated
        // response (measured against production — see the EDGE CACHING note in
        // src/app/embed/[slug]/route.ts), so a purge hook would have had
        // nothing to purge. This header governs browsers and other downstream
        // caches, which is exactly what the short TTL is for.
        source: '/u/:handle',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=60',
          },
          {
            key: 'Vary',
            value: 'Cookie',
          },
        ],
      },
      {
        // Back/forward cache. Chrome refuses to put a page in the bfcache when
        // its main document carries `no-store`, and these routes were getting
        // the default dynamic-render header (`private, no-cache, no-store,
        // max-age=0, must-revalidate`) despite having nothing per-viewer in
        // them — the sign-in state on `/` is fetched client-side from
        // `/api/auth/session`, and `/privacy` is static prose.
        //
        // `max-age=0, must-revalidate` keeps the revalidate-every-navigation
        // behaviour that `no-store` was providing; dropping `no-store` is what
        // restores the bfcache. Left `private` off deliberately: neither
        // response varies by viewer, so there is nothing to keep out of a
        // shared cache, and `max-age=0` means nothing is served stale anyway.
        source: '/',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/privacy',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

// Initialize OpenNext Cloudflare bindings for local development only
// Opt-in via env var because some environments (CI/sandboxes) disallow local listeners/spawned dev helpers.
if (
  process.env.NODE_ENV === 'development' &&
  process.env.OPENNEXT_CLOUDFLARE_DEV === '1'
) {
  void import('@opennextjs/cloudflare')
    .then((m: { initOpenNextCloudflareForDev: () => void }) =>
      m.initOpenNextCloudflareForDev(),
    )
    .catch(() => {});
}
