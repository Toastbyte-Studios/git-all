// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

vi.mock('@/components/ContributionsView', () => ({
  ContributionsView: () => <div>ContributionsView</div>,
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
  handle: null,
  userId: null,
};

describe('WhoAmIClient navigation buttons', () => {
  it('does not render the cd ~ homepage link inside page content', () => {
    render(<WhoAmIClient session={SESSION} />);

    expect(
      screen.queryByRole('link', { name: /cd ~ go to homepage/i }),
    ).toBeNull();
  });
});
