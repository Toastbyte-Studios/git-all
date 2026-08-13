import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '@/lib/auth-session';
import { GET } from '../route';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getAuthSessionFromRequest: vi.fn(),
    getAvailableOAuthProviders: vi.fn(),
    getProfileSummaryByUserId: vi.fn(),
  },
}));

vi.mock('@/lib/auth-session', () => ({
  getAuthSessionFromRequest: mocks.getAuthSessionFromRequest,
}));

vi.mock('@/lib/oauth-providers', () => ({
  getAvailableOAuthProviders: mocks.getAvailableOAuthProviders,
}));

vi.mock('@/lib/profiles', () => ({
  getProfileSummaryByUserId: mocks.getProfileSummaryByUserId,
}));

describe('GET /api/auth/session', () => {
  beforeEach(() => {
    mocks.getAuthSessionFromRequest.mockReset();
    mocks.getAvailableOAuthProviders.mockReset();
    mocks.getProfileSummaryByUserId.mockReset();
  });

  it('includes the signed-in user profile summary when available', async () => {
    const session: AuthSession = {
      primary: 'github',
      userId: 'user-123',
      connections: {
        github: {
          provider: 'github',
          accountId: '123',
          username: 'octocat',
          avatarUrl: 'https://avatars.githubusercontent.com/u/123',
          verifiedAt: 1_717_777_777_000,
        },
      },
    };

    mocks.getAuthSessionFromRequest.mockResolvedValue(session);
    mocks.getAvailableOAuthProviders.mockReturnValue(['github', 'gitlab']);
    mocks.getProfileSummaryByUserId.mockResolvedValue({
      handle: 'octocat',
      isPublic: true,
    });

    const response = await GET(
      new NextRequest('https://gitall.app/api/auth/session'),
    );

    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      availableProviders: ['github', 'gitlab'],
      primary: 'github',
      connections: {
        github: {
          provider: 'github',
          accountId: '123',
          username: 'octocat',
          avatarUrl: 'https://avatars.githubusercontent.com/u/123',
          verifiedAt: 1_717_777_777_000,
        },
      },
      profile: {
        handle: 'octocat',
        isPublic: true,
      },
    });
    expect(mocks.getProfileSummaryByUserId).toHaveBeenCalledWith('user-123');
  });
});
