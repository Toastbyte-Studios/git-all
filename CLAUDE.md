# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Start Next.js dev server on localhost:3000
npm run build          # Next.js production build
npm run test           # Run tests once (Vitest)
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage (src/lib/**/*.ts only)
npm run lint           # ESLint check (ESLint CLI, flat config in eslint.config.mjs)
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier write (src/**/*.{ts,tsx,css})
npm run format:check   # Prettier check
npm run cleanup        # format + lint + test (run before PRs)

# Cloudflare deployment
npm run cf:build       # Build with OpenNext Cloudflare adapter
npm run cf:preview     # cf:build then wrangler dev
npm run cf:deploy      # cf:build then wrangler deploy
```

To run a single test file: `npx vitest run src/lib/__tests__/auth-session.test.ts`

## PR requirements

**Before opening any PR, bump the version in `package.json` following semver:**
- Patch (`x.y.Z`) — bug fixes, copy changes, minor styling tweaks
- Minor (`x.Y.0`) — new features, new API routes, new components
- Major (`X.0.0`) — breaking changes to APIs, session format, or deployment config

The CI workflow `require-version-bump.yml` enforces this and will fail the PR if `package.json` version matches `main`. Always bump as part of the same branch before creating the PR.

## Environment variables

Copy `.env.example` to `.env.local`. Required:
- `GITHUB_TOKEN` — personal access token (no scopes needed); the GitHub GraphQL API requires a token even for public data.

Optional:
- `SESSION_SECRET` — 32+ byte random string; required for OAuth sign-in.
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth app.
- `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` — GitLab application (`read_user` scope).
- `BITBUCKET_CLIENT_KEY` / `BITBUCKET_CLIENT_SECRET` — Bitbucket OAuth consumer (`account` scope).
- `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN` — Cloudflare Web Analytics beacon.
- `ANALYTICS_GA4_MEASUREMENT_ID` / `ANALYTICS_GA4_API_SECRET` — GA4 Measurement Protocol.
- `NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT` — set to `1` to gate client analytics on consent.

In production (Cloudflare Workers), secrets are stored with `wrangler secret put <NAME>`.

## Architecture

### Deployment stack

Next.js 16 (App Router) deployed to Cloudflare Workers via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). `npm run cf:build` produces `.open-next/worker.js` and `.open-next/assets/`, which `wrangler.jsonc` references. The worker has a self-reference service binding (`WORKER_SELF_REFERENCE`) required for Next.js incremental caching and Cloudflare's image optimization binding (`IMAGES`).

`@opennextjs/cloudflare` is pinned to an exact version: it refuses to build Next.js releases outside its supported range, so bump it deliberately alongside `next`. `src/middleware.ts` stays on the deprecated `middleware` convention rather than `proxy`, because `proxy` is Node.js-only and OpenNext for Cloudflare does not support Node.js middleware yet.

### Contribution data flow

Each platform has its own API route that fetches and normalises data to the shared `ContributionData` type (`src/lib/types.ts`):

| Platform | Route | Source |
|---|---|---|
| GitHub | `/api/github` | GraphQL `contributionsCollection` |
| GitLab | `/api/gitlab` | Public REST calendar endpoint |
| Bitbucket | `/api/bitbucket` | Public REST API (aggregated) |
| Gitea/Forgejo | `/api/gitea` | `/api/v1/users/{username}/heatmap` |

The GitHub route maintains an **in-memory per-instance TTL cache** (15 min TTL, max 500 entries) with oldest-entry eviction and deduplicates concurrent in-flight requests with a `Map<string, Promise>`. This cache is not shared across Worker instances; there is a comment indicating Workers Cache or KV as a future upgrade path. Authenticated users bypass this cache and use their own OAuth token, which may include private contributions.

### Agent attribution

`src/lib/agent-attribution.ts` flags commits attributed to AI coding agents (author identity or `Co-authored-by` trailers). Routes that read individual commits add optional `agentCount` per calendar day, plus `agentContributions` and `agentBreakdown`; absent means "not checked", 0 means "checked, none".

- **Bitbucket** checks every commit it already counts.
- **GitHub** runs `src/lib/github-agent-commits.ts` only on the signed-in owner's own lookup with their OAuth token (it reads private repos, so the result is never cached). It reads unfiltered default-branch history because `history(author:)` misses commits where the user is only a co-author.

Display is gated in the UI, not the API: `ContributionsView` shows agent data only when given an `agentAttribution` audience (`owner`, `owner-shared` or `public`). Visitors get `public` only when `users.show_agent_attribution` is on. Because visitors can't compute GitHub counts, `/api/github` saves a public-repos-only summary to `agent_summaries` on the owner's default-period lookup (only while opted in; opting out deletes it), and `/u/[handle]` passes it to `ContributionsView` as `savedAgentSummaries`.

### Two-mode UI

`ContributionExplorer` (`src/components/ContributionExplorer.tsx`) is the main client-side orchestrator. On mount it fetches `/api/auth/session` to determine auth state:

- **Anonymous** → renders `SearchForm` (one username per platform, no time filter).
- **Authenticated** → renders `MultiUserForm` (multiple entries, any platform) + `TimePeriodSelector` (preset ranges + custom date picker).

Time period selection is synced to URL search params (`?period=`, `?from=`, `?to=`). `ContributionsView` fans out the fetch calls and renders either side-by-side `ContributionGrid` panels or a merged integrated view.

### Auth / session architecture

OAuth is implemented without a library. The flow lives in `src/app/api/auth/`:

- `/{provider}` — generates PKCE state, sets an encrypted `gitall_oauth_state_{provider}` cookie, redirects to provider.
- `/callback/[provider]` — exchanges code for token, validates state cookie, writes two encrypted `httpOnly` cookies and redirects:
  - `gitall_session` — AES-GCM encrypted JSON containing connection metadata (no tokens; see `src/lib/auth-session.ts`).
  - `gitall_token_{provider}` — AES-GCM encrypted raw access token in its own cookie, kept separate to stay well under the 4096-byte per-cookie limit (Bitbucket tokens are large).
- `/session` — reads and decrypts the session cookie; returns a redacted shape with `authenticated` and connection summaries.
- `/connections/[provider]` — DELETE to remove a single connection; clears session if the last connection is removed.
- `/logout` — clears all auth cookies.

`SESSION_VERSION` in `auth-session.ts` is bumped when the stored session shape changes, causing old cookies to be silently invalidated.

The `/me` page (`src/app/me/`) is a permanent redirect to `/whoami` to preserve older links. The `/whoami` page displays identity info for verified connections.

### Analytics stack

Three-tier analytics architecture (`src/lib/analytics-events.ts` holds the typed event catalog):

1. **Phase A (cookieless):** Cloudflare Web Analytics beacon loaded via `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN`. No code changes needed; the token is read in `layout.tsx`.
2. **Phase B client events:** `trackClientEvent()` in `src/lib/analytics-client.ts` — tries `window.zaraz.track()` first; if Zaraz is absent falls back to `POST /api/analytics/event`.
3. **Phase B server events:** `sendServerAnalyticsEvent()` in `src/lib/analytics-server.ts` — fires GA4 Measurement Protocol from API routes for high-value conversions. Client ID is derived from a SHA-256 hash of IP + User-Agent + Accept-Language (no cookies).

### Path alias

`@` maps to `src/` (configured in both `tsconfig.json` and `vitest.config.ts`).
