// @vitest-environment happy-dom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContributionGrid } from '../ContributionGrid';

describe('ContributionGrid', () => {
  it('marks the heatmap chrome with the shared class hook', () => {
    const { container } = render(
      <ContributionGrid
        colorKey="github"
        data={{
          platform: 'github',
          username: 'octocat',
          totalContributions: 1,
          dateRange: { from: '2026-01-01', to: '2026-01-01' },
          calendar: [{ date: '2026-01-01', count: 1, level: 1 }],
        }}
      />,
    );

    expect(container.firstElementChild?.className).toContain('heatmap');
  });
});
