<div align="center">

<img src="public/favicon.svg" width="72" height="72" alt="" />

<h1>GitAll</h1>

<strong>One contribution graph for every account you code under.</strong>

GitAll reads contribution calendars from GitHub, GitLab, Bitbucket, and Gitea/Forgejo and shows them side by side &mdash; or merged into a single heatmap.

<a href="https://gitall.app"><strong>gitall.app</strong></a>
&nbsp;&middot;&nbsp;
<a href="#embeddable-heatmaps">Embeds</a>
&nbsp;&middot;&nbsp;
<a href="#running-it-yourself">Self-hosting</a>
&nbsp;&middot;&nbsp;
<a href="#http-api">API</a>

<br />

[![CI](https://github.com/Toastbyte-Studios/git-all/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Toastbyte-Studios/git-all/actions/workflows/ci.yml)
[![Deploy](https://github.com/Toastbyte-Studios/git-all/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/Toastbyte-Studios/git-all/actions/workflows/deploy.yml)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-3DA639?logo=gnu&logoColor=white)](LICENSE)

</div>

---

## Why

If your work is split across a day-job GitLab, a personal GitHub, a client's Bitbucket, and a Codeberg mirror, no single profile page tells the truth about what you actually shipped. GitAll puts those calendars in one place without asking you to move anything.

No account is required. Type in usernames and look.

## Supported platforms

| Platform | Source | Auth required |
| --- | --- | --- |
| **GitHub** | GraphQL `contributionsCollection` | Server-side token (see [Configuration](#configuration)) |
| **GitLab** | Public REST calendar endpoint | No |
| **Bitbucket** | Public REST API, aggregated | No |
| **Gitea / Forgejo** | `/api/v1/users/{username}/heatmap` | No |

Gitea/Forgejo defaults to [Codeberg](https://codeberg.org), with [gitea.com](https://gitea.com) as a second preset and any self-hosted instance URL accepted.

> [!NOTE]
> GitLab's public calendar endpoint only exposes roughly the last 12 months, so longer or older custom ranges will be truncated on the GitLab side.

## What you get

- **Side-by-side view** &mdash; one panel per account, each in its platform colour.
- **Integrated view** &mdash; every calendar merged into a single heatmap with combined totals.
- **Per-day tooltips** and a stats bar with per-platform and combined counts.
- **Time-range filters** for signed-in users: presets plus a custom date picker, synced to the URL (`?period=`, `?from=`, `?to=`).
- **Embeddable SVG heatmaps** for your own README or site.
- **Public profiles** at `/u/{handle}` once you've verified an account.

## Embeddable heatmaps

Any heatmap can be served as a standalone SVG, sized to fit a README:

```markdown
![My contributions](https://gitall.app/embed/octocat.svg)
```

With no query parameters, the path segment is treated as a **GitHub** username. To merge several platforms, pass them explicitly:

```markdown
![My contributions](https://gitall.app/embed/me.svg?github=octocat&gitlab=octocat&bitbucket=octocat)
```

> [!IMPORTANT]
> As soon as any platform parameter is present, the path segment becomes a cosmetic slug only &mdash; it no longer implies a GitHub lookup. Pass `?github=` explicitly if you want GitHub included.

### Parameters

| Parameter | Description |
| --- | --- |
| `github` | GitHub username |
| `gitlab` | GitLab username |
| `bitbucket` | Bitbucket username |
| `gitea` | Gitea/Forgejo username |
| `instance` | Gitea/Forgejo instance URL (defaults to `https://codeberg.org`) |
| `theme` | `dark` (default) or `light` |

The `.svg` extension is optional. The image covers the last 12 months, is cached at the edge for 24 hours, and serves stale content for up to an hour while revalidating. If one platform is slow or unreachable it is dropped from the merge rather than holding up the response &mdash; GitHub's image proxy gives up quickly.

## Public profiles

Signing in creates a profile at `gitall.app/u/{handle}` that renders your verified accounts together. Handles are derived from your provider username on first sign-in and can be changed once every seven days. They are 2&ndash;32 characters of `a-z`, `0-9`, and `-`, with no leading, trailing, or repeated dashes.

Profiles require Cloudflare D1. On a self-hosted deployment without a D1 binding, profile reads and writes are skipped and the rest of the app works normally.

## Signing in

Signing in is optional and unlocks three things: time-range filters, a public profile, and &mdash; for GitHub &mdash; lookups against your own API rate limit that include your private contributions when you look yourself up.

GitHub, GitLab, and Bitbucket can all be connected to the same session, so one profile can span all three.

**On session storage:** OAuth is implemented directly rather than through a library. Session metadata and access tokens are AES-GCM encrypted into separate `httpOnly` cookies, so they are never readable from client-side JavaScript. Tokens live in their own per-provider cookie to stay under the 4&nbsp;KB per-cookie limit. If your threat model includes cookie theft, swap this for an opaque session ID with server-side token storage.

---

## Running it yourself

Requires Node.js 20.9 or newer.

```bash
git clone https://github.com/Toastbyte-Studios/git-all.git
cd git-all
npm install
cp .env.example .env.local
```

Add a `GITHUB_TOKEN` to `.env.local`, then:

```bash
npm run dev
```

Open <http://localhost:3000>.

A GitHub personal access token is the only hard requirement &mdash; GitHub's GraphQL API rejects unauthenticated requests even for public data. A classic token with **no scopes selected** is enough. The other three platforms need nothing.

### Configuration

All of these live in `.env.local` for local development. In production they are Worker secrets (`wrangler secret put <NAME>`).

| Variable | Required | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` | **Yes** | GitHub GraphQL access. No scopes needed. |
| `SESSION_SECRET` | For sign-in | 32+ random bytes; encrypts session cookies. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | For sign-in | GitHub OAuth App. |
| `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` | For sign-in | GitLab application, `read_user` scope. |
| `BITBUCKET_CLIENT_KEY` / `BITBUCKET_CLIENT_SECRET` | For sign-in | Bitbucket OAuth consumer, `account` scope. |
| `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN` | No | Cloudflare Web Analytics beacon. |
| `ANALYTICS_GA4_MEASUREMENT_ID` / `ANALYTICS_GA4_API_SECRET` | No | GA4 Measurement Protocol for server-side events. |
| `NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT` | No | Set to `1` to gate client-side events on consent. |

### OAuth callback URLs

Register these with each provider, substituting your own origin in production:

| Provider | Callback URL | Scope |
| --- | --- | --- |
| GitHub | `http://localhost:3000/api/auth/callback/github` | &mdash; |
| GitLab | `http://localhost:3000/api/auth/callback/gitlab` | `read_user` |
| Bitbucket | `http://localhost:3000/api/auth/callback/bitbucket` | `account` |

### Database (Cloudflare D1)

Profiles are stored in D1. It is only bound under `wrangler dev` or in a deployed Worker &mdash; plain `next dev` runs without it and logs a warning instead of failing.

```bash
wrangler d1 create gitall              # then paste database_id into wrangler.jsonc
npm run db:migrate:local               # local
npm run db:migrate:remote              # production
npm run db:reset:local                 # wipe and re-apply locally
```

### Analytics

All optional, and the app runs fine with none of it configured. Cloudflare Web Analytics provides a cookieless baseline. Product events go through Zaraz when available and fall back to a first-party `POST /api/analytics/event` when it is blocked; a few high-value events are sent server-side via the GA4 Measurement Protocol, with the client ID derived from a hash of IP, user agent, and language rather than a cookie.

If you set `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN`, allow `https://static.cloudflareinsights.com` in your `script-src` CSP directive.

## HTTP API

Each platform has a route that normalises its upstream response to a shared shape.

```
GET /api/github?username=octocat&from=2025-01-01&to=2025-12-31
GET /api/gitlab?username=octocat
GET /api/bitbucket?username=octocat
GET /api/gitea?username=octocat&instanceUrl=https://codeberg.org
```

`from` and `to` are optional and default to the last 12 months. GitHub lookups can span at most one year. Adding `refresh=true` bypasses the cache.

```jsonc
{
  "platform": "github",
  "username": "octocat",
  "totalContributions": 1234,
  "dateRange": { "from": "2025-01-01", "to": "2025-12-31" },
  "calendar": [{ "date": "2025-01-01", "count": 3, "level": 1 }]
}
```

`level` is a 0&ndash;4 intensity bucket. GitHub responses carry an `X-Cache` header of `HIT`, `MISS`, or `BYPASS`.

## Development

```bash
npm run dev            # dev server on :3000
npm run build          # production build
npm run test           # Vitest, single run
npm run test:watch     # Vitest, watch mode
npm run test:coverage  # coverage report
npm run lint           # ESLint
npm run format         # Prettier
npm run cleanup        # format + lint + test
```

Run one test file with `npx vitest run src/lib/__tests__/auth-session.test.ts`.

### Deploying to Cloudflare

The app is a Next.js 15 App Router project built for Cloudflare Workers through [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).

```bash
npm run cf:build       # build the Worker bundle
npm run cf:preview     # build, then run locally under wrangler
npm run cf:deploy      # build and deploy
```

`main` deploys automatically via the Deploy workflow.

> [!WARNING]
> Cloudflare Bot Fight Mode must stay **off** on any zone serving `/embed/*`. GitHub's camo image proxy cannot run JavaScript and so cannot pass the challenge, which silently breaks every embedded heatmap already in the wild. Rate limiting rules scoped to `/embed/*` are the supported alternative.

## Project layout

```
src/
  app/
    api/{github,gitlab,bitbucket,gitea}/  contribution routes
    api/auth/                             OAuth, session, connections
    api/profile/                          handle management
    embed/[slug]/                         SVG heatmap endpoint
    u/[handle]/                           public profiles
    whoami/                               your connected identities
  components/                             UI
  lib/                                    data fetching, session, SVG, types
migrations/                               D1 schema
```

The `@` import alias maps to `src/`.

## Contributing

Issues and pull requests are welcome. Two things to know before you open a PR:

1. Run `npm run cleanup` &mdash; CI runs the same checks.
2. Bump the `version` in `package.json` following semver. A workflow fails the PR if the version matches `main`.

## License

[GNU Affero General Public License v3.0](LICENSE) &mdash; Copyright &copy; 2026 Toastbyte Studios.

Use it, modify it, self-host it. The one condition worth knowing up front: if you run a modified version as a network service, section 13 requires you to offer your users the source of that modified version.

## Built by

[Toastbyte Studios](https://toastbyte.studio)
