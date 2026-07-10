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
      />,
    );

    expect(
      container.firstElementChild?.getAttribute('data-ui-chrome'),
    ).not.toBeNull();
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
});
