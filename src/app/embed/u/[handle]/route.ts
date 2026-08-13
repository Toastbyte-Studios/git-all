import { NextRequest } from 'next/server';
import {
  DEFAULT_CONTRIBUTION_PERIOD,
  getContributionDateRange,
} from '@/lib/contribution-period';
import {
  buildEmbedCacheKey,
  fetchContributions,
  getEdgeCache,
  mergeContributions,
  resolveTheme,
  runAfterResponse,
  stripSvgExtension,
  svgError,
  trackEmbedServed,
  SITE_URL,
  type EmbedPlatformEntry,
} from '@/lib/embed-render';
import { generateHeatmapSvg } from '@/lib/embed-svg';
import {
  getPublicProfileWithUpdatedAtByHandle,
  resolvePublicHandleRedirect,
} from '@/lib/profiles';

// Handle-resolved embed: /embed/u/{handle}.svg
//
// Unlike /embed/[slug], which freezes a set of usernames into the URL at the
// moment it is copied, this route resolves the profile's verified connections
// on every cache miss. A README pasted once keeps tracking the account as the
// owner renames a username, disconnects a provider, or adds a third one.
//
// The operational constraints documented on /embed/[slug] apply here too:
// GitHub's camo proxy cannot execute JavaScript, so Bot Fight Mode must stay
// OFF zone-wide, and any rate limiting rule must be scoped to /embed/*.
//
// PRIVACY CONTRACT
// `getPublicProfileWithUpdatedAtByHandle` returns null both for a handle that
// does not exist and for one whose owner has visibility switched off, and the
// two cases are deliberately indistinguishable to the caller. That property is
// what stops an <img> tag from being used to probe whether an account exists.
// Do not add a distinct message, status, or cache header for the private case,
// and do not swap in `getProfileByHandle` to "improve" the error - that
// reintroduces the oracle. /u/[handle] draws the same line by rendering 404
// rather than 403.

// Deliberately shorter than the 24h used by /embed/[slug]. That route resolves
// nothing server-side, so a cached response can only go stale on contribution
// data. This one caches a snapshot of the profile's visibility and connections,
// which means the cache key is versioned by `users.updated_at` so visibility
// flips, connection changes, and handle renames stop hitting stale entries
// immediately. One hour still bounds freshness for contribution data while
// absorbing the bulk of camo traffic.
const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=600';

// Retired-handle redirects get a much shorter TTL than the images themselves.
// The redirect encodes a mapping that a second rename or a visibility change
// invalidates, and unlike the image responses there is no `updated_at` in the
// cache key to version it. Five minutes bounds how long a stale hop can
// survive while still absorbing a burst.
const REDIRECT_CACHE_CONTROL = 'public, s-maxage=300';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle: rawHandle } = await params;
  const handle = stripSvgExtension(rawHandle);

  if (!handle) {
    return svgError('Missing handle', 400, 'public, s-maxage=86400');
  }

  const theme = resolveTheme(request.nextUrl.searchParams.get('theme'));
  const cache = getEdgeCache();

  // Null covers "no such handle" and "profile is private" - see the privacy
  // contract above. Both fall through to the same response below.
  const profile = await getPublicProfileWithUpdatedAtByHandle(handle);

  // An embed pasted into a README before a rename would otherwise start
  // rendering the 404 image, on a page we do not control and get no signal
  // from. Redirect it to the owner's current handle instead.
  //
  // Only reachable when the handle resolves to nothing at all: a profile that
  // exists but has no connections is a *current* handle and belongs in the
  // shared not-found path below, not here.
  //
  // `resolvePublicHandleRedirect` returns null for a private owner, so this
  // does not become the existence oracle the privacy contract above rules out.
  if (!profile) {
    const currentHandle = await resolvePublicHandleRedirect(handle);
    if (currentHandle) {
      // Rebuilt from the request URL so `?theme=` survives the hop.
      const target = new URL(request.url);
      target.pathname = `/embed/u/${encodeURIComponent(currentHandle)}.svg`;

      // 302 and a short TTL, for the same reason /u/[handle] avoids a 308:
      // renames are reversible, and camo caches aggressively enough that a
      // permanent redirect baked into its cache would be unfixable from here.
      return new Response(null, {
        status: 302,
        headers: {
          Location: target.toString(),
          'Cache-Control': REDIRECT_CACHE_CONTROL,
          'X-Robots-Tag': 'noindex',
        },
      });
    }
  }

  if (!profile || profile.connections.length === 0) {
    // Sentinel version 0: a real profile.updatedAt is a Unix timestamp in
    // seconds and is always > 0, so this key cannot collide with a valid
    // cached entry. The body and headers are identical whether the profile is
    // absent or private — do not introduce a difference here.
    const profileNotFoundKey = buildEmbedCacheKey(request, 0);
    if (cache) {
      const cachedNotFound = await cache.match(profileNotFoundKey);
      if (cachedNotFound) return cachedNotFound;
    }
    const profileNotFoundResponse = svgError(
      'Profile not found',
      404,
      'public, s-maxage=3600',
    );
    if (cache) {
      runAfterResponse(
        cache.put(profileNotFoundKey, profileNotFoundResponse.clone()),
      );
    }
    return profileNotFoundResponse;
  }

  const cacheKey = buildEmbedCacheKey(request, profile.updatedAt);

  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      trackEmbedServed(
        request,
        hit.headers.get('x-gitall-platforms'),
        theme,
        'hit',
        'handle',
      );
      return hit;
    }
  }

  const entries: EmbedPlatformEntry[] = profile.connections.map(
    (connection) => ({
      platform: connection.provider,
      username: connection.username,
    }),
  );

  // Default to last 12 months.
  const { from, to } = getContributionDateRange(DEFAULT_CONTRIBUTION_PERIOD);

  const { data: validResults, hasTransient } = await fetchContributions(
    request.nextUrl.origin,
    entries,
    from,
    to,
  );

  if (validResults.length === 0) {
    // Only cache when all failures were definitive. A transient failure
    // (timeout, 5xx, rate limit) must stay no-store so a real user's embed
    // recovers as soon as the upstream does.
    const errorCacheDirective = hasTransient
      ? 'no-store'
      : 'public, s-maxage=3600';
    const errorResponse = svgError(
      'No contribution data found',
      404,
      errorCacheDirective,
    );
    if (cache && !hasTransient) {
      runAfterResponse(cache.put(cacheKey, errorResponse.clone()));
    }
    return errorResponse;
  }

  const merged = mergeContributions(validResults);
  const svg = generateHeatmapSvg(merged, { theme, siteUrl: SITE_URL });
  const platforms = validResults.map((r) => r.platform).join('+');

  const response = new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': CACHE_CONTROL,
      'X-Robots-Tag': 'noindex',
      // Cloudflare's edge cache only understands `Vary: Accept-Encoding`.
      // Set it explicitly so the RSC negotiation headers OpenNext applies
      // globally do not suppress caching of this image response.
      Vary: 'Accept-Encoding',
      // Read back on a cache hit so the analytics event can report platforms
      // without re-running the upstream fetches.
      'x-gitall-platforms': platforms,
    },
  });

  if (cache) {
    runAfterResponse(cache.put(cacheKey, response.clone()));
  }

  trackEmbedServed(request, platforms, theme, 'miss', 'handle');

  return response;
}
