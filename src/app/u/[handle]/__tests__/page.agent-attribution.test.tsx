import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthSession } from '@/lib/auth-session';
import { getAgentSummaries, getProfileByHandle } from '@/lib/profiles';
import type { Profile } from '@/lib/types';
import PublicProfilePage from '../page';

// Who gets which agent view is decided here, server-side, and the summaries
// are serialised into the page for whoever is allowed them. These tests pin
// that decision; the client components just render what they're given.

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  permanentRedirect: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('@/lib/analytics-server', () => ({ trackServerEvent: vi.fn() }));

vi.mock('@/lib/auth-session', () => ({ getAuthSession: vi.fn() }));

vi.mock('@/lib/profiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/profiles')>();
  return {
    ...actual,
    getProfileByHandle: vi.fn(),
    getAgentSummaries: vi.fn(),
    resolvePublicHandleRedirect: vi.fn(async () => null),
  };
});

vi.mock('../PublicProfileClient', () => ({
  PublicProfileClient: vi.fn().mockReturnValue(null),
}));

const OWNER_ID = '01JOWNER000000000000000000';
const SUMMARIES = {
  github: {
    agentContributions: 3,
    agentBreakdown: { claude: 3 },
    from: '2025-10-28',
    to: '2026-10-28',
    computedAt: 1,
  },
};

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: OWNER_ID,
    handle: 'jane',
    displayName: 'Jane',
    primaryProvider: 'github',
    handleChangedAt: null,
    isPublic: true,
    showAgentAttribution: false,
    createdAt: 1,
    updatedAt: 1,
    connections: [],
    ...overrides,
  };
}

async function renderFor({
  viewer,
  optedIn,
}: {
  viewer: 'owner' | 'visitor';
  optedIn: boolean;
}) {
  vi.mocked(getProfileByHandle).mockResolvedValue(
    profile({ showAgentAttribution: optedIn }),
  );
  vi.mocked(getAuthSession).mockResolvedValue(
    viewer === 'owner'
      ? { primary: 'github', connections: {}, userId: OWNER_ID }
      : null,
  );
  vi.mocked(getAgentSummaries).mockResolvedValue(SUMMARIES);

  const element = (await PublicProfilePage({
    params: Promise.resolve({ handle: 'jane' }),
  })) as { props: Record<string, unknown> };
  return element.props;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/u/[handle] agent attribution', () => {
  it('shows visitors nothing, and loads nothing, until the owner opts in', async () => {
    const props = await renderFor({ viewer: 'visitor', optedIn: false });

    expect(props.agentAttribution).toBeUndefined();
    expect(props.agentSummaries).toEqual({});
    expect(getAgentSummaries).not.toHaveBeenCalled();
  });

  it('shows visitors the saved summary once the owner opts in', async () => {
    const props = await renderFor({ viewer: 'visitor', optedIn: true });

    expect(props.agentAttribution).toBe('public');
    expect(props.agentSummaries).toEqual(SUMMARIES);
    expect(getAgentSummaries).toHaveBeenCalledWith(OWNER_ID);
  });

  it('shows the owner their own split before opting in', async () => {
    const props = await renderFor({ viewer: 'owner', optedIn: false });

    expect(props.agentAttribution).toBe('owner');
    expect(props.agentSummaries).toEqual({});
  });

  it('tells an opted-in owner what visitors see', async () => {
    const props = await renderFor({ viewer: 'owner', optedIn: true });

    expect(props.agentAttribution).toBe('owner-shared');
    expect(props.agentSummaries).toEqual(SUMMARIES);
  });

  it('still renders the profile if the summaries fail to load', async () => {
    vi.mocked(getProfileByHandle).mockResolvedValue(
      profile({ showAgentAttribution: true }),
    );
    vi.mocked(getAuthSession).mockResolvedValue(null);
    vi.mocked(getAgentSummaries).mockRejectedValue(new Error('D1 down'));

    const element = (await PublicProfilePage({
      params: Promise.resolve({ handle: 'jane' }),
    })) as { props: Record<string, unknown> };

    expect(element.props.agentAttribution).toBe('public');
    expect(element.props.agentSummaries).toEqual({});
  });
});
