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
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
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
