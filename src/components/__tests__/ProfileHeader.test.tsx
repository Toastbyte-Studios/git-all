// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileHeader } from '../ProfileHeader';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={(props.alt as string) ?? ''} />
  ),
}));

describe('ProfileHeader', () => {
  it('renders connected providers as an unstyled semantic list', () => {
    render(
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

    const list = screen.getByRole('list');
    expect(list.tagName).toBe('UL');
    expect(list.className).toContain('list-none');
    expect((list as HTMLElement).style.paddingInlineStart).toBe('0');

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect((item as HTMLElement).style.listStyle).toBe('none');
    }
  });
});
