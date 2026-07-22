// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/lib/types';
import { PublicProfileClient } from '../PublicProfileClient';

vi.mock('next/image', () => ({
  default: (props: JSX.IntrinsicElements['img']) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt ?? ''} />
  ),
}));

vi.mock('@/components/ContributionsView', () => ({
  ContributionsView: () => <div>ContributionsView</div>,
}));

const USER_ID = '01JZZZZZZZZZZZZZZZZZZZZZZZ';

const PROFILE: Profile = {
  id: USER_ID,
  handle: 'octocat',
  displayName: null,
  primaryProvider: 'github',
  handleChangedAt: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  connections: [
    {
      userId: USER_ID,
      provider: 'github',
      accountId: '1',
      username: 'octocat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1',
      verifiedAt: Date.now(),
    },
  ],
};

describe('PublicProfileClient navigation buttons', () => {
  it('does not render the cd ~ homepage link inside page content', () => {
    render(<PublicProfileClient profile={PROFILE} />);

    expect(
      screen.queryByRole('link', { name: /cd ~ go to homepage/i }),
    ).toBeNull();
  });
});
