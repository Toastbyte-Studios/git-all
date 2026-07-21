// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const originalClipboard = navigator.clipboard;
const originalIsSecureContext = window.isSecureContext;

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

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: originalClipboard,
    configurable: true,
  });
  Object.defineProperty(window, 'isSecureContext', {
    value: originalIsSecureContext,
    configurable: true,
  });
  vi.useRealTimers();
});

describe('WhoAmIClient copy toast', () => {
  it('shows one toast and resets dismiss timer on rapid repeat copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(<WhoAmIClient session={SESSION} />);

    const copyButtons = screen.getAllByRole('button', {
      name: /copy username octocat to clipboard/i,
    });

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(copyButtons[0]);
    });
    expect(screen.getByRole('status')).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith('octocat');

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await act(async () => {
      fireEvent.click(copyButtons[0]);
    });

    expect(screen.getAllByRole('status')).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByRole('status')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1300);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
