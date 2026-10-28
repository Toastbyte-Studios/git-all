// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContributionData } from '@/lib/types';
import { AgentAttributionSummary } from '../AgentAttributionSummary';
import { ContributionGrid } from '../ContributionGrid';
import { ContributionsView, mergeAllContributions } from '../ContributionsView';

function data(overrides: Partial<ContributionData> = {}): ContributionData {
  return {
    platform: 'github',
    username: 'octocat',
    totalContributions: 5,
    dateRange: { from: '2026-01-01', to: '2026-01-02' },
    calendar: [
      { date: '2026-01-01', count: 3, level: 1 },
      { date: '2026-01-02', count: 2, level: 1 },
    ],
    ...overrides,
  };
}

const CHECKED = data({
  calendar: [
    { date: '2026-01-01', count: 3, level: 1, agentCount: 2 },
    { date: '2026-01-02', count: 2, level: 1, agentCount: 0 },
  ],
  agentContributions: 2,
  agentBreakdown: { copilot: 1, claude: 2 },
});

describe('AgentAttributionSummary', () => {
  it('renders nothing when the platform did not check', () => {
    const { container } = render(<AgentAttributionSummary data={data()} />);
    expect(container.textContent).toBe('');
  });

  it('says so when it checked and found none', () => {
    render(
      <AgentAttributionSummary
        data={data({ agentContributions: 0, agentBreakdown: {} })}
      />,
    );
    expect(screen.getByTestId('agent-attribution-summary').textContent).toBe(
      'No agent-attributed commits in this period.',
    );
  });

  it('shows the count and the agents, most-used first', () => {
    render(<AgentAttributionSummary data={CHECKED} />);
    expect(screen.getByTestId('agent-attribution-summary').textContent).toBe(
      '2 agent-attributed commits · Claude 2 · Copilot 1',
    );
  });

  it('uses the singular for one commit and notes owner-only visibility', () => {
    render(
      <AgentAttributionSummary
        data={data({ agentContributions: 1, agentBreakdown: { cursor: 1 } })}
        ownerOnly
      />,
    );
    expect(screen.getByTestId('agent-attribution-summary').textContent).toBe(
      '1 agent-attributed commit · Cursor 1 (only visible to you)',
    );
  });
});

describe('ContributionGrid tooltip', () => {
  function hoverFirstDay(showAgentCounts: boolean) {
    const { container } = render(
      <ContributionGrid
        colorKey="github"
        data={CHECKED}
        showAgentCounts={showAgentCounts}
      />,
    );
    fireEvent.mouseEnter(container.querySelector('rect')!);
  }

  it('adds the agent count when enabled', () => {
    hoverFirstDay(true);
    expect(
      screen.getByText('3 contributions on 2026-01-01 · 2 agent-attributed'),
    ).toBeTruthy();
  });

  it('leaves the tooltip unchanged when disabled', () => {
    hoverFirstDay(false);
    expect(screen.getByText('3 contributions on 2026-01-01')).toBeTruthy();
  });
});

describe('mergeAllContributions', () => {
  it('leaves agent fields off when no source checked', () => {
    const merged = mergeAllContributions([data(), null, data()]);

    expect(merged).not.toHaveProperty('agentContributions');
    expect(merged).not.toHaveProperty('agentBreakdown');
    expect(merged.calendar[0]).not.toHaveProperty('agentCount');
    expect(merged.totalContributions).toBe(10);
  });

  it('sums agent fields from the sources that checked', () => {
    const merged = mergeAllContributions([
      CHECKED,
      data({ platform: 'gitlab', username: 'jdoe' }),
      data({
        platform: 'bitbucket',
        username: 'ws',
        calendar: [{ date: '2026-01-02', count: 4, level: 2, agentCount: 1 }],
        agentContributions: 1,
        agentBreakdown: { claude: 1 },
      }),
    ]);

    expect(merged.agentContributions).toBe(3);
    expect(merged.agentBreakdown).toEqual({ claude: 3, copilot: 1 });
    expect(merged.calendar).toEqual([
      { date: '2026-01-01', count: 6, level: 2, agentCount: 2 },
      { date: '2026-01-02', count: 8, level: 3, agentCount: 1 },
    ]);
    expect(merged.username).toBe('octocat + jdoe + ws');
  });
});

describe('ContributionsView agent display', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderView(showAgentAttribution?: boolean) {
    // Bitbucket returns agent fields to anyone, so this is the case the
    // view-level gate exists for.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ ...CHECKED, platform: 'bitbucket', username: 'ws' }),
      ),
    );
    render(
      <ContributionsView
        entries={[
          { id: 'bitbucket:ws', platform: 'bitbucket', username: 'ws' },
        ]}
        viewMode="side-by-side"
        onViewModeChange={() => {}}
        from="2026-01-01"
        to="2026-01-02"
        showAgentAttribution={showAgentAttribution}
      />,
    );
  }

  it('hides agent data from the API by default', async () => {
    renderView();
    await waitFor(() => expect(document.querySelector('rect')).not.toBeNull());
    expect(screen.queryByTestId('agent-attribution-summary')).toBeNull();
  });

  it('shows it to the owner', async () => {
    renderView(true);
    expect(
      (await screen.findByTestId('agent-attribution-summary')).textContent,
    ).toContain('2 agent-attributed commits');
  });
});
