// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhoAmIClient } from '../WhoAmIClient';
import type { ClientSession } from '../page';
import type { JSX } from 'react';

vi.mock('next/image', () => ({
  default: (props: JSX.IntrinsicElements['img']) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt ?? ''} />
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const viewProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('@/components/ContributionsView', () => ({
  ContributionsView: (props: Record<string, unknown>) => {
    viewProps.push(props);
    return <div>ContributionsView</div>;
  },
}));

vi.mock('@/components/TimePeriodSelector', () => ({
  TimePeriodSelector: () => <div>TimePeriodSelector</div>,
}));

const SESSION: ClientSession = {
  primary: 'github',
  connections: {
    github: {
      provider: 'github',
      accountId: '1',
      username: 'octocat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1',
      verifiedAt: Date.now(),
    },
  },
  availableProviders: ['github'],
  handle: 'octocat',
  isPublic: false,
  showAgentAttribution: false,
  userId: '01JZZZZZZZZZZZZZZZZZZZZZZZ',
};

function agentSwitch() {
  return screen.getByRole('switch', {
    name: 'Show agent-attributed commits on public profile',
  });
}

describe('WhoAmIClient agent attribution', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('always shows the owner their own agent split', () => {
    viewProps.length = 0;
    render(<WhoAmIClient session={SESSION} />);
    expect(viewProps.at(-1)?.showAgentAttribution).toBe(true);
  });

  it('starts off and saves when switched on', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: true, showAgentAttribution: true }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<WhoAmIClient session={SESSION} />);

    expect(agentSwitch().getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(/Off\. Only you see/)).toBeTruthy();

    fireEvent.click(agentSwitch());

    await waitFor(() =>
      expect(agentSwitch().getAttribute('aria-checked')).toBe('true'),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profile/agent-attribution',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ showAgentAttribution: true }),
      }),
    );
  });

  it('rolls back and explains when saving fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'db_unavailable' }, { status: 503 }),
      ),
    );
    render(<WhoAmIClient session={SESSION} />);

    fireEvent.click(agentSwitch());

    expect(
      await screen.findByText(/Profile database is unavailable/),
    ).toBeTruthy();
    expect(agentSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('is hidden without a stored profile', () => {
    render(<WhoAmIClient session={{ ...SESSION, userId: null }} />);
    expect(
      screen.queryByRole('switch', {
        name: 'Show agent-attributed commits on public profile',
      }),
    ).toBeNull();
  });
});
