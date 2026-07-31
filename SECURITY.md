# Security Policy

git-all is a live service that handles OAuth tokens for multiple providers and stores a
database of linked developer identities. We take reports about it seriously and we'd
rather hear about a problem from you than from a public issue.

## Reporting a Vulnerability

**Please do not open a public issue for security reports.**

Use GitHub's private vulnerability reporting:
[**Report a vulnerability**](https://github.com/Toastbyte-Studios/git-all/security/advisories/new)

This opens a draft security advisory visible only to you and the maintainers. If you
can't use GitHub for any reason, email <!-- TODO: confirm address --> `security@git-all.com`.

### What to include

- The affected URL, endpoint, or file path
- Steps to reproduce, ideally with a minimal request or proof of concept
- What an attacker gains — access to data, another user's session, server-side requests, etc.
- Any conditions required (specific provider, account state, timing)

### What to expect

- **Acknowledgement within five business days.** We're a small team; this is a
  commitment we can actually keep rather than a number that looks good.
- An assessment and a rough timeline once we've reproduced it.
- Notification when it's fixed and deployed.
- Credit in the advisory if you'd like it — tell us how you want to be named.

**There is no bug bounty.** We don't have the budget for one and we'd rather say so
than let you guess. Reports are still genuinely welcome.

## Supported Versions

git-all is continuously deployed. The only supported version is the currently deployed
version of `main`. There are no maintained release branches or backports.

## Scope

### In scope

The following are the parts of the codebase most worth your attention. We'd rather name
them than have you wonder whether we consider them fair game.

**Session handling** — `src/lib/auth-session.ts`
The encrypted session cookie and the per-provider token cookies. Issues with encryption,
signing, cookie attributes, session fixation, or token leakage across providers.

**OAuth flows** — `src/app/api/auth/callback/[provider]/route.ts`
State-parameter CSRF protection and the `returnTo` open-redirect guard. If you can
bypass either, we want to know.

**SSRF surface** — `src/app/api/gitea/route.ts`
This endpoint accepts user-supplied Gitea instance URLs, which makes it the most
probe-worthy thing in the repo. It has protections — internal-IP blocking via
`node:dns` and `node:net`, request timeouts, and a response-size cap. **Please scrutinize
them.** DNS rebinding, redirect chains, IPv6 and encoded-address forms, and anything else
that gets past the resolver checks are all in scope.

**Embed route egress**
The embed route loops back through the service's own public API from server egress.
Anything exploitable in that path.

**Handle enumeration and access control** — `/u/[handle]`
Enumeration of registered handles, and access control on profile data. This includes
whether private profiles actually stay private.

**D1 data access paths**
Any route that reads or writes linked-identity data. Injection, missing authorization
checks, or cross-user data exposure.

### Out of scope

We'll close these without much discussion, so please don't spend your time on them:

- **Rate limiting on public lookup endpoints.** These serve public data by design.
- **Automated scanner output with no demonstrated impact.** Show us an exploit path.
- **Anything requiring physical access or an already-compromised user device.**
- **Social engineering** of maintainers, users, or infrastructure providers.
- Missing security headers <!-- TODO: confirm whether CSP / HSTS / Referrer-Policy /
  X-Content-Type-Options are applied at the Cloudflare edge. If they are, keep this line
  and add "— these are applied at the CDN edge rather than in `next.config.ts`." If they
  aren't, delete this bullet, because then it's a real finding. -->

## Safe Harbor

We consider security research conducted in accordance with this policy to be authorized,
and we will not pursue or support legal action against you for it.

To stay within good faith:

- Only test against accounts you control. Don't access, modify, or exfiltrate other
  users' data. If you encounter someone else's data, stop and report it.
- Don't degrade the service. No denial-of-service testing, no automated scanning at
  volume, no spam.
- Don't use social engineering, phishing, or physical attacks.
- Give us reasonable time to fix an issue before disclosing it publicly.

If you're unsure whether something is within bounds, ask first.

## Preferred Languages

English.
