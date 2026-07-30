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
  async headers() {
    return [
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
    ];
  },
};

export default nextConfig;

// Initialize OpenNext Cloudflare bindings for local development only
// Opt-in via env var because some environments (CI/sandboxes) disallow local listeners/spawned dev helpers.
if (process.env.NODE_ENV === 'development' && process.env.OPENNEXT_CLOUDFLARE_DEV === '1') {
  void import('@opennextjs/cloudflare')
    .then((m: { initOpenNextCloudflareForDev: () => void }) => m.initOpenNextCloudflareForDev())
    .catch(() => {});
}
