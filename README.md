# GitAll

Unified contribution heatmap viewer for GitHub, GitLab, Bitbucket, and Gitea/Forgejo. Enter usernames from any supported platform and see their contribution squares side-by-side or merged into a single integrated view.

**Live at [gitall.app](https://gitall.app)**
<img src="https://github.com/Toastbyte-Studios/git-all/actions/workflows/deploy.yml/badge.svg">

## Getting Started

```bash
git clone https://github.com/jason-shprintz/git-all.git
cd git-all
npm install
```

Copy the env file and add your GitHub token:

```bash
cp .env.example .env.local
# Edit .env.local and add your GITHUB_TOKEN
```

A GitHub personal access token is needed to call the GraphQL API (even for public data). No special scopes required — a classic token with zero permissions works.

### Optional: Sign in with GitHub OAuth

OAuth is optional. Anonymous users can still use the app normally, but signed-in users can use their own GitHub API rate limit and unlock private contribution data on their own profile.

OAuth session data is stored in an encrypted, authenticated `httpOnly` cookie so it is not available to client-side JavaScript. If your deployment requires stronger resistance to cookie theft, use an opaque session id with server-side token storage instead.

1. Create a GitHub OAuth App: **GitHub Settings → Developer settings → OAuth Apps → New OAuth App**
2. Set **Authorization callback URL** to:
   - `http://localhost:3000/api/auth/callback` for local dev
   - `https://your-domain/api/auth/callback` in production
3. Add these values to `.env.local`:

```bash
GITHUB_CLIENT_ID=your_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_oauth_app_client_secret
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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

- [git-contributions MCP service](https://github.com/jason-shprintz/mcp-services) — the MCP server counterpart for AI agents

## Built by

[Toastbyte Studios](https://toastbyte.studio)
