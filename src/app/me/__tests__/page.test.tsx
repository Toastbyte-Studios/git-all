import { permanentRedirect } from 'next/navigation';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MeRedirect from '../page';

vi.mock('next/navigation', () => ({
  permanentRedirect: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/me redirect', () => {
  it('permanently redirects to /whoami', () => {
    MeRedirect();
    expect(permanentRedirect).toHaveBeenCalledWith('/whoami');
  });
});
