import { redirect } from 'next/navigation';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuthSession, type AuthSession } from '@/lib/auth-session';
import MePage, { type ClientSession } from '../page';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@/lib/auth-session', () => ({
  getAuthSession: vi.fn(),
}));

vi.mock('@/lib/oauth-providers', () => ({
  getAvailableOAuthProviders: vi.fn().mockReturnValue(['github']),
}));

vi.mock('../MeClient', () => ({
  MeClient: vi.fn().mockReturnValue(null),
}));

const SAMPLE_SESSION: AuthSession = {
  primary: 'github',
  connections: {
    github: {
      provider: 'github',
      accountId: '123',
      username: 'testuser',
      avatarUrl: 'https://avatars.githubusercontent.com/u/123',
      accessToken: 'gho_test',
      verifiedAt: Date.now(),
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MePage auth gate', () => {
  it('redirects to /?signin=required when there is no session', async () => {
    vi.mocked(getAuthSession).mockResolvedValue(null);

    await MePage();

    expect(redirect).toHaveBeenCalledWith('/?signin=required');
  });

  it('redirects to /?signin=required when connections are empty', async () => {
    vi.mocked(getAuthSession).mockResolvedValue({
      primary: 'github',
      connections: {},
    } satisfies AuthSession);

    await MePage();

    expect(redirect).toHaveBeenCalledWith('/?signin=required');
  });

  it('does not redirect when a valid session is present', async () => {
    vi.mocked(getAuthSession).mockResolvedValue(SAMPLE_SESSION);

    await MePage();

    expect(redirect).not.toHaveBeenCalled();
  });

  it('strips accessToken from session props passed to MeClient', async () => {
    vi.mocked(getAuthSession).mockResolvedValue(SAMPLE_SESSION);

    // MePage returns a React element; inspect its props without rendering.
    const element = (await MePage()) as {
      props: { session: ClientSession };
    } | null;
    expect(element).not.toBeNull();

    const session = element!.props.session;
    const ghConnection = session.connections.github;
    expect(ghConnection).toBeDefined();
    expect(ghConnection).not.toHaveProperty('accessToken');
    expect(ghConnection?.username).toBe('testuser');
    expect(ghConnection?.provider).toBe('github');
  });

  it('passes all connected providers to MeClient', async () => {
    vi.mocked(getAuthSession).mockResolvedValue({
      primary: 'gitlab',
      connections: {
        github: SAMPLE_SESSION.connections.github,
        gitlab: {
          provider: 'gitlab',
          accountId: '456',
          username: 'gitlabuser',
          avatarUrl: 'https://gitlab.com/avatar.png',
          accessToken: 'glpat-test',
          verifiedAt: Date.now(),
        },
      },
    } satisfies AuthSession);

    const element = (await MePage()) as {
      props: { session: ClientSession };
    } | null;
    expect(element).not.toBeNull();

    const session = element!.props.session;
    expect(Object.keys(session.connections)).toHaveLength(2);
    expect(session.primary).toBe('gitlab');
  });
});
