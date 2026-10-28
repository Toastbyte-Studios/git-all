import type { AgentId } from './agent-attribution';

export interface CalendarDay {
  date: string;
  count: number;
  level: number;
  /**
   * How many of `count` are attributed to an AI coding agent (see
   * `src/lib/agent-attribution.ts`). Present only on platforms that inspect
   * individual commits: absent means "not checked", 0 means "checked, none".
   */
  agentCount?: number;
}

/** Agent-attributed commit totals for a period, without the per-day split. */
export interface AgentTotals {
  agentContributions: number;
  agentBreakdown: Partial<Record<AgentId, number>>;
}

/**
 * An agent summary saved from the owner's own lookup, for visitors. Public
 * repositories only (see `github-agent-commits.ts`).
 */
export interface SavedAgentSummary extends AgentTotals {
  /** Inclusive `YYYY-MM-DD` range the totals cover. */
  from: string;
  to: string;
  /** Unix ms when the owner's lookup produced it. */
  computedAt: number;
}

export interface ContributionData {
  platform: string;
  username: string;
  totalContributions: number;
  dateRange: {
    from: string | null;
    to: string | null;
  };
  calendar: CalendarDay[];
  /** Sum of `agentCount` across the calendar. Same presence rule as `agentCount`. */
  agentContributions?: number;
  /**
   * Commits attributed to each agent. A commit attributed to two agents counts
   * once in `agentContributions` but once for each agent here, so these can
   * sum to more than `agentContributions`.
   */
  agentBreakdown?: Partial<Record<AgentId, number>>;
  /**
   * Set when the agent fields came from a {@link SavedAgentSummary} rather
   * than a live read: the summary covers public repos only and is as of this
   * time (unix ms), with no per-day `agentCount`.
   */
  agentSummaryComputedAt?: number;
}

export type ConnectionProvider = 'github' | 'gitlab' | 'bitbucket';

export interface Connection {
  provider: ConnectionProvider;
  accountId: string;
  username: string;
  avatarUrl: string;
  /** Not persisted in the session cookie; loaded from a separate per-provider token cookie. */
  accessToken?: string;
  verifiedAt: number;
}

export type Platform = 'github' | 'gitlab' | 'bitbucket' | 'gitea';

/** A connection record as stored in D1 (no access token). */
export interface StoredConnection {
  userId: string;
  provider: ConnectionProvider;
  accountId: string;
  username: string;
  avatarUrl: string | null;
  verifiedAt: number;
}

/** A persistent user profile as stored in D1. */
export interface Profile {
  id: string;
  handle: string;
  displayName: string | null;
  primaryProvider: ConnectionProvider;
  handleChangedAt: number | null;
  isPublic: boolean;
  /** Whether visitors see agent-attributed commits. The owner always does. */
  showAgentAttribution: boolean;
  createdAt: number;
  updatedAt: number;
  connections: StoredConnection[];
}

/**
 * A single connection as exposed on the public profile page.
 *
 * Deliberately narrower than {@link StoredConnection}: `userId` is the internal
 * ULID (repeated once per connection) and `accountId` is a provider-side
 * identifier. Neither is needed to render the page.
 */
export interface PublicConnection {
  provider: ConnectionProvider;
  username: string;
  avatarUrl: string | null;
}

/**
 * The subset of a profile that is safe to serialise into the public
 * `/u/[handle]` page payload.
 *
 * Deliberately narrower than {@link Profile}. `id` is a ULID and therefore
 * time-sortable — its first 10 characters are a base32-encoded millisecond
 * timestamp, so shipping it discloses account creation time to anyone who
 * decodes it. `handleChangedAt` reveals whether and when the user renamed.
 *
 * This type is the public/private boundary: adding a field here is a deliberate
 * act of publication, and a new column on `users` does not become public by
 * omission. Build it with `toPublicProfile()` rather than by casting.
 */
export interface PublicProfile {
  handle: string;
  displayName: string | null;
  primaryProvider: ConnectionProvider;
  connections: PublicConnection[];
}

export type ViewMode = 'side-by-side' | 'integrated';

export interface UserEntry {
  id: string;
  platform: Platform;
  username: string;
  instanceUrl?: string;
}

export interface UserResult {
  entry: UserEntry;
  data: ContributionData | null;
  error: string | null;
}
