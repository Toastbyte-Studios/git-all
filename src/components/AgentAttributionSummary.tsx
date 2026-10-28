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
 * Who is looking at the agent split, which decides the note after it:
 * - `owner`: the owner, not opted in. Nobody else sees it.
 * - `owner-shared`: the owner, opted in. Visitors see a public-repos-only
 *   version, so the owner is told theirs includes more.
 * - `public`: a visitor to an opted-in profile.
 */
export type AgentAttributionAudience = 'owner' | 'owner-shared' | 'public';

const AUDIENCE_NOTES: Record<AgentAttributionAudience, string> = {
  owner: ' (only visible to you)',
  'owner-shared': ' (visitors see public repositories only)',
  public: '',
};

/** Fixed format and UTC, so server and client render the same string. */
function formatAsOf(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

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
  audience = 'public',
}: {
  data: ContributionData;
  audience?: AgentAttributionAudience;
}) {
  if (data.agentContributions === undefined) return null;

  const count = data.agentContributions;
  const breakdown = Object.entries(data.agentBreakdown ?? {})
    .filter((entry): entry is [AgentId, number] => (entry[1] ?? 0) > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([agent, n]) => `${AGENT_LABELS[agent] ?? agent} ${n}`);
  const saved =
    data.agentSummaryComputedAt !== undefined
      ? ` · public repositories, as of ${formatAsOf(data.agentSummaryComputedAt)}`
      : '';

  return (
    <p
      className="mt-2 text-xs"
      style={{ color: 'var(--text-secondary)' }}
      data-testid="agent-attribution-summary"
    >
      {count === 0 ? (
        'No agent-attributed commits in this period'
      ) : (
        <>
          <strong style={{ color: 'var(--text-primary)' }}>{count}</strong>{' '}
          agent-attributed commit{count === 1 ? '' : 's'}
          {breakdown.length > 0 && ` · ${breakdown.join(' · ')}`}
        </>
      )}
      {saved}
      {AUDIENCE_NOTES[audience]}
    </p>
  );
}
