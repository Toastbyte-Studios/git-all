// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileHeader } from '../ProfileHeader';

vi.mock('next/image', () => ({
  default: (props: JSX.IntrinsicElements['img']) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt ?? ''} />
  ),
}));

describe('ProfileHeader', () => {
  it('renders connected providers as an unstyled semantic list', () => {
    const { container } = render(
      <ProfileHeader
        primary="github"
        connections={{
          github: {
            provider: 'github',
            username: 'octocat',
            avatarUrl: 'https://avatars.githubusercontent.com/u/1',
          },
          gitlab: {
            provider: 'gitlab',
            username: 'gitlabuser',
            avatarUrl: 'https://gitlab.com/avatar.png',
          },
        }}
        handle="octocat"
      />,
    );

    expect(container.firstElementChild?.hasAttribute('data-ui-chrome')).toBe(
      true,
    );
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('UL');
    expect(list.className).toContain('list-none');
    expect((list as HTMLElement).style.paddingInlineStart).toMatch(/^0(px)?$/);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect((item as HTMLElement).style.listStyle).toBe('none');
    }
  });

  it('displays the canonical GitAll handle as a click-to-copy button', () => {
    render(
      <ProfileHeader
        primary="github"
        connections={{
          github: {
            provider: 'github',
            username: 'octocat',
            avatarUrl: 'https://avatars.githubusercontent.com/u/1',
          },
        }}
        handle="my-gitall-handle"
      />,
    );

    const copyBtn = screen.getByRole('button', {
      name: /copy username my-gitall-handle to clipboard/i,
    });
    expect(copyBtn).toBeTruthy();
    expect(copyBtn.textContent).toContain('my-gitall-handle');
  });

  it('does not truncate a 32-character handle', () => {
    const longHandle = 'a'.repeat(32);
    render(
      <ProfileHeader
        primary="github"
        connections={{
          github: {
            provider: 'github',
            username: 'octocat',
            avatarUrl: 'https://avatars.githubusercontent.com/u/1',
          },
        }}
        handle={longHandle}
      />,
    );

    const copyBtn = screen.getByRole('button', {
      name: new RegExp(`copy username ${longHandle} to clipboard`, 'i'),
    });
    expect(copyBtn.className).not.toContain('truncate');
  });

  it('shows "No handle set" placeholder when handle is null', () => {
    render(
      <ProfileHeader
        primary="github"
        connections={{
          github: {
            provider: 'github',
            username: 'octocat',
            avatarUrl: 'https://avatars.githubusercontent.com/u/1',
          },
        }}
        handle={null}
      />,
    );

    expect(screen.getByText('No handle set')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /copy username/i })).toBeNull();
  });

  it('renders a share link to /u/<handle> when handle is set', () => {
    render(
      <ProfileHeader
        primary="github"
        connections={{
          github: {
            provider: 'github',
            username: 'octocat',
            avatarUrl: 'https://avatars.githubusercontent.com/u/1',
          },
        }}
        handle="octocat"
      />,
    );

    const shareLink = screen.getByRole('link', {
      name: /view your public profile/i,
    });
    expect(shareLink.getAttribute('href')).toContain('/u/octocat');
  });

  it('renders a disabled Share button when handle is null', () => {
    render(
      <ProfileHeader
        primary="github"
        connections={{
          github: {
            provider: 'github',
            username: 'octocat',
            avatarUrl: 'https://avatars.githubusercontent.com/u/1',
          },
        }}
        handle={null}
      />,
    );

    const shareBtn = screen.getByRole('button', {
      name: /set a handle to share your profile/i,
    });
    expect(shareBtn).toBeTruthy();
    expect((shareBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not display the provider username in the header identity area', () => {
    render(
      <ProfileHeader
        primary="github"
        connections={{
          github: {
            provider: 'github',
            username: 'octocat',
            avatarUrl: 'https://avatars.githubusercontent.com/u/1',
          },
        }}
        handle="my-gitall-handle"
      />,
    );

    // The provider username should not appear as a copyable identity in the header.
    // (It lives in ConnectionsPanel, not here.)
    expect(
      screen.queryByRole('button', {
        name: /copy username octocat to clipboard/i,
      }),
    ).toBeNull();
  });
});
