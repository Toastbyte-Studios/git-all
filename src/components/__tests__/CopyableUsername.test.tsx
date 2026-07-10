// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyableUsername } from '../CopyableUsername';

const originalClipboard = navigator.clipboard;
const originalIsSecureContext = window.isSecureContext;
const originalExecCommand = document.execCommand;

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: originalClipboard,
    configurable: true,
  });
  Object.defineProperty(window, 'isSecureContext', {
    value: originalIsSecureContext,
    configurable: true,
  });
  document.execCommand = originalExecCommand;
});

describe('CopyableUsername', () => {
  it('copies the bare username via Clipboard API and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onCopyResult = vi.fn();

    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(<CopyableUsername username="octocat" onCopyResult={onCopyResult} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Copy username octocat to clipboard',
      }),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('octocat');
      expect(onCopyResult).toHaveBeenCalledWith({
        success: true,
        username: 'octocat',
      });
    });
  });

  it('falls back and reports failure if copy cannot be completed', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const execCommand = vi.fn().mockReturnValue(false);
    const onCopyResult = vi.fn();

    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    document.execCommand = execCommand;

    render(<CopyableUsername username="octocat" onCopyResult={onCopyResult} />);

    const button = screen.getByRole('button', {
      name: 'Copy username octocat to clipboard',
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(onCopyResult).toHaveBeenCalledWith({
        success: false,
        username: 'octocat',
      });
      expect(button.getAttribute('data-copy-state')).toBe('error');
    });
  });
});
