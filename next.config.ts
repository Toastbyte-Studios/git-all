import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;

// Initialize OpenNext Cloudflare bindings for local development only
// Opt-in via env var because some environments (CI/sandboxes) disallow local listeners/spawned dev helpers.
if (process.env.NODE_ENV === 'development' && process.env.OPENNEXT_CLOUDFLARE_DEV === '1') {
  void import('@opennextjs/cloudflare')
    .then((m: { initOpenNextCloudflareForDev: () => void }) => m.initOpenNextCloudflareForDev())
    .catch(() => {});
}
