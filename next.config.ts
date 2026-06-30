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
};

export default nextConfig;

// Initialize OpenNext Cloudflare bindings for local development only
// Opt-in via env var because some environments (CI/sandboxes) disallow local listeners/spawned dev helpers.
if (process.env.NODE_ENV === 'development' && process.env.OPENNEXT_CLOUDFLARE_DEV === '1') {
  void import('@opennextjs/cloudflare')
    .then((m: { initOpenNextCloudflareForDev: () => void }) => m.initOpenNextCloudflareForDev())
    .catch(() => {});
}
