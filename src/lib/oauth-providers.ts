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

function parseBitbucketIdentity(payload: unknown): OAuthIdentity | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as {
    account_id?: string;
    username?: string;
    links?: {
      avatar?: {
        href?: string;
      };
    };
  };

  if (
    !isNonEmptyString(candidate.account_id) ||
    !isNonEmptyString(candidate.username) ||
    !isNonEmptyString(candidate.links?.avatar?.href)
  ) {
    return null;
  }

  return {
    accountId: candidate.account_id,
    username: candidate.username,
    avatarUrl: candidate.links.avatar.href,
  };
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
    },
  };

export const CONNECTION_PROVIDERS = Object.keys(
  OAUTH_PROVIDERS,
) as ConnectionProvider[];

export function hasOAuthConfig(provider: ConnectionProvider) {
  const config = OAUTH_PROVIDERS[provider];
  return Boolean(
    process.env[config.clientIdEnv] && process.env[config.clientSecretEnv],
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
