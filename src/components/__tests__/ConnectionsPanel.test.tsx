// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type ConnectionProvider } from '@/lib/types';
import { ConnectionsPanel } from '../ConnectionsPanel';

// Mock next/navigation
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const GITHUB_CONNECTION = {
  provider: 'github' as ConnectionProvider,
  username: 'octocat',
  avatarUrl: 'https://avatars.githubusercontent.com/u/1',
};

const GITLAB_CONNECTION = {
  provider: 'gitlab' as ConnectionProvider,
  username: 'gitlabuser',
  avatarUrl: 'https://gitlab.com/avatar.png',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ConnectionsPanel', () => {
  describe('connected provider', () => {
    it('shows the username and verified chip for a connected provider', () => {
      render(
        <ConnectionsPanel
          connections={{ github: GITHUB_CONNECTION }}
          availableProviders={['github']}
        />,
      );

      expect(screen.getByText('@octocat')).toBeTruthy();
      expect(screen.getAllByText(/✓ Verified/).length).toBeGreaterThan(0);
    });

    it('stacks the verified chip below the username for connected providers', () => {
      render(
        <ConnectionsPanel
          connections={{
            github: GITHUB_CONNECTION,
            gitlab: GITLAB_CONNECTION,
          }}
          availableProviders={['github', 'gitlab']}
        />,
      );

      const githubBadge = screen.getByLabelText('GitHub verified');
      const gitlabBadge = screen.getByLabelText('GitLab verified');

      expect(githubBadge.parentElement!.className).toContain('flex');
      expect(githubBadge.parentElement!.className).toContain('flex-col');
      expect(githubBadge.parentElement!.className).toContain('items-start');
      expect(githubBadge.className).not.toContain('ml-2');

      expect(gitlabBadge.parentElement!.className).toContain('flex');
      expect(gitlabBadge.parentElement!.className).toContain('flex-col');
      expect(gitlabBadge.parentElement!.className).toContain('items-start');
      expect(gitlabBadge.className).not.toContain('ml-2');
    });

    it('renders a Disconnect button for a connected provider', () => {
      render(
        <ConnectionsPanel
          connections={{ github: GITHUB_CONNECTION }}
          availableProviders={['github']}
        />,
      );

      const btn = screen.getByRole('button', { name: /disconnect github/i });
      expect(btn).toBeTruthy();
    });

    it('calls DELETE and router.refresh on disconnect', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      render(
        <ConnectionsPanel
          connections={{ github: GITHUB_CONNECTION }}
          availableProviders={['github']}
        />,
      );

      const btn = screen.getByRole('button', { name: /disconnect github/i });
      fireEvent.click(btn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/auth/connections/github',
          expect.objectContaining({ method: 'DELETE' }),
        );
        expect(mockRefresh).toHaveBeenCalled();
      });
    });

    it('shows an error message when disconnect fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });

      render(
        <ConnectionsPanel
          connections={{ github: GITHUB_CONNECTION }}
          availableProviders={['github']}
        />,
      );

      const btn = screen.getByRole('button', { name: /disconnect github/i });
      fireEvent.click(btn);

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeTruthy();
      });
    });
  });

  describe('unconnected provider', () => {
    it('shows a Connect CTA when provider is available but not connected', () => {
      render(
        <ConnectionsPanel
          connections={{}}
          availableProviders={['github', 'gitlab']}
        />,
      );

      const link = screen.getByRole('link', { name: /connect with github/i });
      expect(link).toBeTruthy();
      expect((link as HTMLAnchorElement).href).toMatch(/\/api\/auth\/github/);
    });

    it('shows "not configured" for a provider that is neither connected nor available', () => {
      render(
        <ConnectionsPanel connections={{}} availableProviders={['github']} />,
      );

      // gitlab and bitbucket are not available and not connected
      expect(screen.getByText(/gitlab.*not configured/i)).toBeTruthy();
    });
  });

  describe('multiple connections', () => {
    it('renders all three providers', () => {
      render(
        <ConnectionsPanel
          connections={{
            github: GITHUB_CONNECTION,
            gitlab: GITLAB_CONNECTION,
          }}
          availableProviders={['github', 'gitlab', 'bitbucket']}
        />,
      );

      expect(screen.getByText('@octocat')).toBeTruthy();
      expect(screen.getByText('@gitlabuser')).toBeTruthy();
      // Bitbucket available but not connected → shows Connect CTA
      expect(
        screen.getByRole('link', { name: /connect with bitbucket/i }),
      ).toBeTruthy();
    });
  });
});
