// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContributionData } from '@/lib/types';
import { AgentAttributionSummary } from '../AgentAttributionSummary';
import { ContributionGrid } from '../ContributionGrid';
import {
  ContributionsView,
  mergeAllContributions,
  withSavedAgentSummary,
} from '../ContributionsView';

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
      'No agent-attributed commits in this period',
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
        audience="owner"
      />,
    );
    expect(screen.getByTestId('agent-attribution-summary').textContent).toBe(
      '1 agent-attributed commit · Cursor 1 (only visible to you)',
    );
  });

  it('tells an opted-in owner that visitors see public repositories only', () => {
    render(<AgentAttributionSummary data={CHECKED} audience="owner-shared" />);
    expect(
      screen.getByTestId('agent-attribution-summary').textContent,
    ).toContain('(visitors see public repositories only)');
  });

  it('labels a saved summary with its scope and date', () => {
    render(
      <AgentAttributionSummary
        data={data({
          agentContributions: 4,
          agentBreakdown: { claude: 4 },
          agentSummaryComputedAt: Date.UTC(2026, 9, 28, 23, 30),
        })}
        audience="public"
      />,
    );
    expect(screen.getByTestId('agent-attribution-summary').textContent).toBe(
      '4 agent-attributed commits · Claude 4 · public repositories, as of Oct 28, 2026',
    );
  });
});

describe('withSavedAgentSummary', () => {
  const SAVED = {
    agentContributions: 4,
    agentBreakdown: { claude: 4 },
    from: '2025-10-28',
    to: '2026-10-28',
    computedAt: 1_800_000_000_000,
  };

  it('fills in a response that has no agent fields', () => {
    expect(withSavedAgentSummary(data(), SAVED)).toMatchObject({
      agentContributions: 4,
      agentBreakdown: { claude: 4 },
      agentSummaryComputedAt: 1_800_000_000_000,
    });
  });

  it('never replaces a live read', () => {
    expect(withSavedAgentSummary(CHECKED, SAVED)).toBe(CHECKED);
  });

  it('leaves data alone without a summary', () => {
    const plain = data();
    expect(withSavedAgentSummary(plain, undefined)).toBe(plain);
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
    expect(merged).not.toHaveProperty('agentSummaryComputedAt');
  });

  it('dates a combined total by its oldest saved summary', () => {
    const merged = mergeAllContributions([
      data({
        agentContributions: 2,
        agentBreakdown: { claude: 2 },
        agentSummaryComputedAt: 200,
      }),
      data({
        agentContributions: 1,
        agentBreakdown: { claude: 1 },
        agentSummaryComputedAt: 100,
      }),
      CHECKED,
    ]);

    expect(merged.agentContributions).toBe(5);
    expect(merged.agentSummaryComputedAt).toBe(100);
  });
});

describe('ContributionsView agent display', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const SAVED_GITHUB = {
    agentContributions: 7,
    agentBreakdown: { copilot: 7 },
    from: '2026-01-01',
    to: '2026-01-02',
    computedAt: Date.UTC(2026, 9, 28),
  };

  function renderView(
    response: ContributionData,
    props: Partial<Parameters<typeof ContributionsView>[0]> = {},
  ) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(response)),
    );
    const platform = response.platform as 'github' | 'bitbucket';
    render(
      <ContributionsView
        entries={[{ id: `${platform}:u`, platform, username: 'u' }]}
        viewMode="side-by-side"
        onViewModeChange={() => {}}
        from="2026-01-01"
        to="2026-01-02"
        {...props}
      />,
    );
  }

  // Bitbucket returns agent fields to anyone, so this is the case the
  // view-level gate exists for.
  const BITBUCKET = { ...CHECKED, platform: 'bitbucket', username: 'ws' };

  it('hides agent data from the API by default', async () => {
    renderView(BITBUCKET, { savedAgentSummaries: { bitbucket: SAVED_GITHUB } });
    await waitFor(() => expect(document.querySelector('rect')).not.toBeNull());
    expect(screen.queryByTestId('agent-attribution-summary')).toBeNull();
  });

  it('shows it to the owner', async () => {
    renderView(BITBUCKET, { agentAttribution: 'owner' });
    expect(
      (await screen.findByTestId('agent-attribution-summary')).textContent,
    ).toBe(
      '2 agent-attributed commits · Claude 2 · Copilot 1 (only visible to you)',
    );
  });

  it('shows visitors the saved summary where the live response has none', async () => {
    renderView(data(), {
      agentAttribution: 'public',
      savedAgentSummaries: { github: SAVED_GITHUB },
    });
    expect(
      (await screen.findByTestId('agent-attribution-summary')).textContent,
    ).toBe(
      '7 agent-attributed commits · Copilot 7 · public repositories, as of Oct 28, 2026',
    );
  });

  it('prefers the live read over a saved summary', async () => {
    renderView(CHECKED, {
      agentAttribution: 'owner-shared',
      savedAgentSummaries: { github: SAVED_GITHUB },
    });
    const text = (await screen.findByTestId('agent-attribution-summary'))
      .textContent;
    expect(text).toContain('2 agent-attributed commits');
    expect(text).not.toContain('as of');
  });

  it('uses the saved summary in the combined view too', async () => {
    renderView(data(), {
      viewMode: 'integrated',
      agentAttribution: 'public',
      savedAgentSummaries: { github: SAVED_GITHUB },
    });
    expect(
      (await screen.findByTestId('agent-attribution-summary')).textContent,
    ).toContain('7 agent-attributed commits');
  });

  it('shows nothing to visitors when there is no saved summary', async () => {
    renderView(data(), { agentAttribution: 'public' });
    await waitFor(() => expect(document.querySelector('rect')).not.toBeNull());
    expect(screen.queryByTestId('agent-attribution-summary')).toBeNull();
  });
});
