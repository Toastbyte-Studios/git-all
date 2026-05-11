// default open-next.config.ts file created by @opennextjs/cloudflare
let defineCloudflareConfig: any;
try {
  ({ defineCloudflareConfig } = require('@opennextjs/cloudflare'));
} catch (e) {
  // Fallback if module not found
  defineCloudflareConfig = (config: any) => config;
}
// import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  // For best results consider enabling R2 caching
  // See https://opennext.js.org/cloudflare/caching for more details
  // incrementalCache: r2IncrementalCache
});
