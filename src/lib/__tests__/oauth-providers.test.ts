import { describe, expect, it } from 'vitest';
import { getVisibleOAuthProviders } from '@/lib/oauth-providers';

describe('getVisibleOAuthProviders', () => {
  it('keeps configured providers when present', () => {
    expect(getVisibleOAuthProviders(['github', 'gitlab'])).toEqual([
      'github',
      'gitlab',
    ]);
  });

  it('falls back to GitHub when the provider list is empty', () => {
    expect(getVisibleOAuthProviders([])).toEqual(['github']);
  });

  it('falls back to GitHub when the provider list is missing', () => {
    expect(getVisibleOAuthProviders()).toEqual(['github']);
  });
});
