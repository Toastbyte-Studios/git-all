// @vitest-environment happy-dom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmbedWidget } from '../EmbedWidget';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('EmbedWidget', () => {
  it('keeps the preview loading when returning to a URL before it is reloaded', () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 401 })),
    );

    render(<EmbedWidget handle="octocat" isPublic />);

    act(() => vi.advanceTimersByTime(600));
    const preview = screen.getByRole('img', { hidden: true });
    fireEvent.load(preview);

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    act(() => vi.advanceTimersByTime(600));
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }));

    expect(screen.getByText('Rendering preview…')).toBeTruthy();
  });

  it('hydrates into handle mode and exposes the selected toggle state', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          profile: {
            handle: 'octocat',
            isPublic: true,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<EmbedWidget />);

    const handleButton = await screen.findByRole('button', {
      name: 'My handle',
    });
    const customButton = screen.getByRole('button', {
      name: 'Custom usernames',
    });

    await waitFor(() => {
      expect(handleButton.getAttribute('aria-pressed')).toBe('true');
      expect(customButton.getAttribute('aria-pressed')).toBe('false');
    });

    fireEvent.click(customButton);

    expect(handleButton.getAttribute('aria-pressed')).toBe('false');
    expect(customButton.getAttribute('aria-pressed')).toBe('true');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', {
      cache: 'no-store',
    });
  });
});
