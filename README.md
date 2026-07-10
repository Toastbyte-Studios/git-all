# GitAll

Unified contribution heatmap viewer for GitHub, GitLab, Bitbucket, and Gitea/Forgejo. Enter usernames from any supported platform and see their contribution squares side-by-side or merged into a single integrated view.

**Live at [gitall.app](https://gitall.app)**
[![Deploy to Cloudflare](https://github.com/Toastbyte-Studios/git-all/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/Toastbyte-Studios/git-all/actions/workflows/deploy.yml)

## Getting Started

```bash
git clone https://github.com/Toastbyte-Studios/git-all.git
cd git-all
npm install
```

Copy the env file and add your GitHub token:

```bash
cp .env.example .env.local
# Edit .env.local and add your GITHUB_TOKEN
```

A GitHub personal access token is needed to call the GraphQL API (even for public data). No special scopes required — a classic token with zero permissions works.

### Optional: Sign in with GitHub, GitLab, and Bitbucket OAuth

OAuth is optional. Anonymous users can still use the app normally, but signed-in users can verify ownership of their GitHub, GitLab, and Bitbucket identities in one shared session. If a GitHub connection is present, GitAll can also use that user's GitHub API rate limit and include their private GitHub contributions on self-lookups.

OAuth session data is stored in an encrypted, authenticated `httpOnly` cookie so it is not available to client-side JavaScript. If your deployment requires stronger resistance to cookie theft, use an opaque session id with server-side token storage instead.

1. Generate a random `SESSION_SECRET` (32+ bytes recommended) and add it to `.env.local`.
2. Create a GitHub OAuth App: **GitHub Settings → Developer settings → OAuth Apps → New OAuth App**
3. Set **Authorization callback URL** to:
   - `http://localhost:3000/api/auth/callback/github` for local dev
   - `https://your-domain/api/auth/callback/github` in production
4. Create a GitLab application: **GitLab → User Settings → Applications**
   - Redirect URI: `http://localhost:3000/api/auth/callback/gitlab` for local dev
   - Redirect URI: `https://your-domain/api/auth/callback/gitlab` in production
   - Scope: `read_user`
5. Create a Bitbucket OAuth consumer: **Bitbucket Workspace → Settings → OAuth consumers**
   - Callback URL: `http://localhost:3000/api/auth/callback/bitbucket` for local dev
   - Callback URL: `https://your-domain/api/auth/callback/bitbucket` in production
   - Scope: `account`
6. Add any configured provider values to `.env.local`:

```bash
SESSION_SECRET=long_random_string_here

GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret

GITLAB_CLIENT_ID=your_gitlab_application_client_id
GITLAB_CLIENT_SECRET=your_gitlab_application_client_secret

BITBUCKET_CLIENT_KEY=your_bitbucket_oauth_consumer_key
BITBUCKET_CLIENT_SECRET=your_bitbucket_oauth_consumer_secret
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Analytics foundation (Cloudflare + server-side events)

This repo ships a first-party analytics foundation for the monetization funnel:

- **Phase A (cookieless baseline):** optional Cloudflare Web Analytics beacon via `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN`.
- **Phase B (event tracking):**
  - Client product events use `window.zaraz.track(...)` when Zaraz is enabled.
  - If Zaraz is unavailable (blocked or disabled), client events fall back to first-party `POST /api/analytics/event`.
  - High-value conversions are emitted server-side via GA4 Measurement Protocol from API/auth routes.

Server-side GA4 credentials:

```bash
ANALYTICS_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
ANALYTICS_GA4_API_SECRET=your_ga4_measurement_protocol_api_secret
```

Optional consent gating (for client-side analytics events):

```bash
NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT=1
```

Implemented event catalog (foundation + roadmap placeholders):

- `lookup_run`
- `lookup_success`
- `sign_in`
- `connect_provider`
- `multi_account_connected`
- `integrated_view_used`
- `time_range_selected`
- `embed_generated` (reserved for #41)
- `pro_page_view` (reserved for #41)
- `pro_checkout_started` (reserved for #41)
- `pro_checkout_completed` (reserved for #41)
- `teams_waitlist_signup` (reserved for teams waitlist page)

> CSP note: if you set `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN`, allow `https://static.cloudflareinsights.com` in `script-src`. Zaraz/GA4 origins should be added in your deployment CSP policy as part of your centralized CSP configuration.

### Production deployment checklist

Before merging auth changes to `main`:

1. Set `SESSION_SECRET` as a production Worker secret (`wrangler secret put SESSION_SECRET`).
2. Update the GitHub OAuth App callback URL to `https://gitall.app/api/auth/callback/github`.
3. If launching GitLab on day one, create the GitLab app with redirect URI `https://gitall.app/api/auth/callback/gitlab`, then set `GITLAB_CLIENT_ID` and `GITLAB_CLIENT_SECRET` as Worker secrets.
4. If launching Bitbucket on day one, create the Bitbucket OAuth consumer with callback URL `https://gitall.app/api/auth/callback/bitbucket`, then set `BITBUCKET_CLIENT_KEY` and `BITBUCKET_CLIENT_SECRET` as Worker secrets.
5. On the preview deployment, verify GitHub sign-in end-to-end, confirm `/api/auth/session` returns the redacted multi-connection shape, and confirm deleting a lone connection clears the session cookie.

## Features

- **GitHub contributions** via GraphQL API (server-side requests; OAuth token is encrypted in `httpOnly` session cookie)
- **GitLab contributions** via public REST API (no auth needed)
- **Bitbucket contributions** via public REST API aggregation (no auth needed)
- **Gitea / Forgejo contributions** via public REST API (`/api/v1/users/{username}/heatmap`) with selectable instance URL (Codeberg by default)
- **Side-by-side view** with platform-specific colors (green for GitHub, orange for GitLab, blue for Bitbucket, violet for Gitea/Forgejo)
- **Integrated view** that merges all calendars into a single heatmap
- **Stats bar** showing per-platform and combined totals
- **Tooltips** on hover showing exact counts per day
- **Time-period filters** for logged-in users, including preset ranges and a custom date picker

> GitLab's public calendar endpoint only exposes roughly the last 12 months, so older custom or "Last year" ranges may be truncated on the GitLab side.

## Tech Stack

- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4

## Related

- git-contributions MCP service — the MCP server counterpart for AI agents

## Built by

[Toastbyte Studios](https://toastbyte.studio)
