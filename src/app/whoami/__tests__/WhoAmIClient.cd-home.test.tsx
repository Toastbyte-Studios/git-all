// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WhoAmIClient } from '../WhoAmIClient';
import type { ClientSession } from '../page';

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
};

describe('WhoAmIClient cd ~ link', () => {
  it('renders a link labelled "cd ~ Go to homepage" pointing to /', () => {
    render(<WhoAmIClient session={SESSION} />);

    const link = screen.getByRole('link', { name: /cd ~ go to homepage/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/');
  });

  it('displays "cd ~" as the visible text', () => {
    render(<WhoAmIClient session={SESSION} />);

    const link = screen.getByRole('link', { name: /cd ~ go to homepage/i });
    expect(link.textContent).toContain('cd ~');
  });

  it('marks the $ prompt prefix as aria-hidden', () => {
    render(<WhoAmIClient session={SESSION} />);

    const link = screen.getByRole('link', { name: /cd ~ go to homepage/i });
    const hiddenPrefix = link.querySelector('[aria-hidden="true"]');
    expect(hiddenPrefix).toBeTruthy();
    expect(hiddenPrefix!.textContent).toContain('$');
  });
});
