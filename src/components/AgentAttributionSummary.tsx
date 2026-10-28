import type { AgentId } from '@/lib/agent-attribution';
import type { ContributionData } from '@/lib/types';

export const AGENT_LABELS: Record<AgentId, string> = {
  claude: 'Claude',
  copilot: 'Copilot',
  cursor: 'Cursor',
  codex: 'Codex',
  devin: 'Devin',
};

/**
 * One line under a heatmap: how many commits in the period are attributed to
 * an AI coding agent, and which agents. Renders nothing when the platform
 * didn't check (`agentContributions` absent), so "not checked" never reads as
 * "none".
 *
 * Deliberately no percentage: `totalContributions` counts more than commits
 * on some platforms (GitHub includes PRs, issues and reviews), so a ratio
 * against it would understate agent work.
 */
export function AgentAttributionSummary({
  data,
  ownerOnly = false,
}: {
  data: ContributionData;
  /** Adds a note that only the viewer (the owner) can see this line. */
  ownerOnly?: boolean;
}) {
  if (data.agentContributions === undefined) return null;

  const count = data.agentContributions;
  const breakdown = Object.entries(data.agentBreakdown ?? {})
    .filter((entry): entry is [AgentId, number] => (entry[1] ?? 0) > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([agent, n]) => `${AGENT_LABELS[agent] ?? agent} ${n}`);

  return (
    <p
      className="mt-2 text-xs"
      style={{ color: 'var(--text-secondary)' }}
      data-testid="agent-attribution-summary"
    >
      {count === 0 ? (
        'No agent-attributed commits in this period.'
      ) : (
        <>
          <strong style={{ color: 'var(--text-primary)' }}>{count}</strong>{' '}
          agent-attributed commit{count === 1 ? '' : 's'}
          {breakdown.length > 0 && ` · ${breakdown.join(' · ')}`}
        </>
      )}
      {ownerOnly && ' (only visible to you)'}
    </p>
  );
}
