import type { ConnectionProvider } from '@/lib/types';

export interface OAuthIdentity {
  accountId: string;
  username: string;
  avatarUrl: string;
}

interface OAuthProviderConfig {
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizeUrl: string;
  tokenUrl: string;
  userUrl: string;
  scope: string;
  tokenAuth: 'body' | 'basic';
  parseIdentity: (payload: unknown) => OAuthIdentity | null;
  /**
   * Optional override for identity fetching. When present, replaces the
   * default single-request fetch + parseIdentity flow. Useful for providers
   * that need multiple API calls (e.g. Bitbucket workspace slug lookup).
   */
  fetchIdentity?: (
    accessToken: string,
    userAgent: string,
  ) => Promise<OAuthIdentity | null>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseGithubIdentity(payload: unknown): OAuthIdentity | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as {
    id?: number | string;
    login?: string;
    avatar_url?: string;
  };

  if (
    candidate.id === undefined ||
    !isNonEmptyString(candidate.login) ||
    !isNonEmptyString(candidate.avatar_url)
  ) {
    return null;
  }

  return {
    accountId: String(candidate.id),
    username: candidate.login,
    avatarUrl: candidate.avatar_url,
  };
}

function parseGitlabIdentity(payload: unknown): OAuthIdentity | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as {
    id?: number | string;
    username?: string;
    avatar_url?: string;
  };

  if (
    candidate.id === undefined ||
    !isNonEmptyString(candidate.username) ||
    !isNonEmptyString(candidate.avatar_url)
  ) {
    return null;
  }

  return {
    accountId: String(candidate.id),
    username: candidate.username,
    avatarUrl: candidate.avatar_url,
  };
}

const BITBUCKET_API_BASE = 'https://api.bitbucket.org/2.0';

function parseBitbucketIdentity(payload: unknown): OAuthIdentity | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as {
    account_id?: string;
    nickname?: string;
    links?: {
      avatar?: {
        href?: string;
      };
    };
  };

  if (
    !isNonEmptyString(candidate.account_id) ||
    !isNonEmptyString(candidate.nickname) ||
    !isNonEmptyString(candidate.links?.avatar?.href)
  ) {
    return null;
  }

  return {
    accountId: candidate.account_id,
    username: candidate.nickname,
    avatarUrl: candidate.links.avatar.href,
  };
}

/**
 * Fetch Bitbucket identity via two API calls:
 *   1. /2.0/user — account_id and avatar
 *   2. /2.0/user/permissions/workspaces?role=owner — workspace slug
 *
 * The workspace slug is the value that appears in Bitbucket URLs
 * (e.g. bitbucket.org/{slug}/...) and is the correct identifier
 * to use for repository lookups. The `nickname` field on /2.0/user
 * may hold the user's display name rather than their workspace slug.
 */
async function fetchBitbucketIdentity(
  accessToken: string,
  userAgent: string,
): Promise<OAuthIdentity | null> {
  const headers = {
    Authorization: 'Bearer ' + accessToken,
    Accept: 'application/json',
    'User-Agent': userAgent,
  };

  const [userResponseResult, workspacesResponseResult] =
    await Promise.allSettled([
      fetch(`${BITBUCKET_API_BASE}/user`, { headers }),
      fetch(
        `${BITBUCKET_API_BASE}/user/permissions/workspaces?role=owner&pagelen=1`,
        { headers },
      ),
    ]);

  if (userResponseResult.status !== 'fulfilled') {
    return null;
  }

  const userResponse = userResponseResult.value;

  if (!userResponse.ok) {
    return null;
  }

  const userPayload = await userResponse.json();
  const userIdentity = parseBitbucketIdentity(userPayload);
  if (!userIdentity) {
    return null;
  }

  const legacyUsername = (() => {
    const candidate = userPayload as { username?: unknown };
    return isNonEmptyString(candidate.username) ? candidate.username : null;
  })();

  // If the workspaces call succeeds, prefer the workspace slug over nickname
  // because nickname may be a display name rather than the URL-safe slug.
  if (
    workspacesResponseResult.status === 'fulfilled' &&
    workspacesResponseResult.value.ok
  ) {
    const workspacesPayload = (await workspacesResponseResult.value.json()) as {
      values?: Array<{ workspace?: { slug?: string } }>;
    };
    const slug = workspacesPayload.values?.[0]?.workspace?.slug;
    if (isNonEmptyString(slug)) {
      // Bitbucket creates a synthetic "-admin" workspace (slug = real-slug + "-admin")
      // alongside every personal workspace. When the workspaces endpoint returns this
      // admin slug, strip the suffix so the stored identifier resolves in public API
      // lookups (e.g. GET /2.0/repositories/{workspace}).
      if (slug.endsWith('-admin')) {
        const baseSlug = slug.slice(0, -'-admin'.length);
        if (isNonEmptyString(baseSlug)) {
          return { ...userIdentity, username: baseSlug };
        }
      }
      return { ...userIdentity, username: slug };
    }
  }

  // If the workspaces call fails, prefer the deprecated `username` field when present,
  // as it is more likely to be the URL-safe workspace identifier than `nickname`.
  if (legacyUsername) {
    // The deprecated `username` field may also carry the synthetic -admin suffix.
    // Strip it for the same reason as above.
    if (legacyUsername.endsWith('-admin')) {
      const base = legacyUsername.slice(0, -'-admin'.length);
      if (isNonEmptyString(base)) {
        return { ...userIdentity, username: base };
      }
    }
    return { ...userIdentity, username: legacyUsername };
  }

  return userIdentity;
}

export const OAUTH_PROVIDERS: Record<ConnectionProvider, OAuthProviderConfig> =
  {
    github: {
      clientIdEnv: 'GITHUB_CLIENT_ID',
      clientSecretEnv: 'GITHUB_CLIENT_SECRET',
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userUrl: 'https://api.github.com/user',
      scope: 'read:user',
      tokenAuth: 'body',
      parseIdentity: parseGithubIdentity,
    },
    gitlab: {
      clientIdEnv: 'GITLAB_CLIENT_ID',
      clientSecretEnv: 'GITLAB_CLIENT_SECRET',
      authorizeUrl: 'https://gitlab.com/oauth/authorize',
      tokenUrl: 'https://gitlab.com/oauth/token',
      userUrl: 'https://gitlab.com/api/v4/user',
      scope: 'read_user',
      tokenAuth: 'body',
      parseIdentity: parseGitlabIdentity,
    },
    bitbucket: {
      clientIdEnv: 'BITBUCKET_CLIENT_KEY',
      clientSecretEnv: 'BITBUCKET_CLIENT_SECRET',
      authorizeUrl: 'https://bitbucket.org/site/oauth2/authorize',
      tokenUrl: 'https://bitbucket.org/site/oauth2/access_token',
      userUrl: 'https://api.bitbucket.org/2.0/user',
      scope: 'account',
      tokenAuth: 'basic',
      parseIdentity: parseBitbucketIdentity,
      fetchIdentity: fetchBitbucketIdentity,
    },
  };

export const CONNECTION_PROVIDERS = Object.keys(
  OAUTH_PROVIDERS,
) as ConnectionProvider[];

export function hasOAuthConfig(provider: ConnectionProvider) {
  const config = OAUTH_PROVIDERS[provider];
  return Boolean(
    process.env.SESSION_SECRET &&
    process.env[config.clientIdEnv] &&
    process.env[config.clientSecretEnv],
  );
}

export function getOAuthClientId(provider: ConnectionProvider) {
  return process.env[OAUTH_PROVIDERS[provider].clientIdEnv] ?? null;
}

export function getOAuthClientSecret(provider: ConnectionProvider) {
  return process.env[OAUTH_PROVIDERS[provider].clientSecretEnv] ?? null;
}

export function getAvailableOAuthProviders() {
  return CONNECTION_PROVIDERS.filter((provider) => hasOAuthConfig(provider));
}

export function getVisibleOAuthProviders(
  availableProviders?: ConnectionProvider[],
) {
  return availableProviders && availableProviders.length > 0
    ? availableProviders
    : (['github'] as ConnectionProvider[]);
}
