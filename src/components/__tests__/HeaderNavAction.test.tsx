// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderNavAction } from '../HeaderNavAction';

const mockUsePathname = vi.fn<() => string>();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('HeaderNavAction', () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
  });

  it('shows the whoami button on the homepage for signed-in users', () => {
    mockUsePathname.mockReturnValue('/');

    render(<HeaderNavAction authenticated />);

    const link = screen.getByRole('link', {
      name: /whoami open your profile/i,
    });
    expect(link.getAttribute('href')).toBe('/whoami');
  });

  it('shows the cd ~ button on the /whoami page', () => {
    mockUsePathname.mockReturnValue('/whoami');

    render(<HeaderNavAction authenticated />);

    const link = screen.getByRole('link', { name: /cd ~ go to homepage/i });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('shows the cd ~ button on public profile pages', () => {
    mockUsePathname.mockReturnValue('/u/octocat');

    render(<HeaderNavAction authenticated={false} />);

    const link = screen.getByRole('link', { name: /cd ~ go to homepage/i });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('keeps a reserved header slot when no navigation action is visible', () => {
    mockUsePathname.mockReturnValue('/embed/example');

    render(<HeaderNavAction authenticated={false} />);

    expect(screen.queryByRole('link', { name: /whoami|cd ~/i })).toBeNull();
    expect(screen.getByTestId('header-nav-action-slot').className).toContain(
      'w-20',
    );
  });
});
