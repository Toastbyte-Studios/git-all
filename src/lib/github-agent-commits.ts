import { type AgentId, detectAgents } from '@/lib/agent-attribution';
import { APP_USER_AGENT } from '@/lib/app-metadata';
import {
  toExclusiveUpperBoundIso,
  toStartOfDayIso,
} from '@/lib/contribution-period';
import type { AgentTotals } from '@/lib/types';

/**
 * Counts a GitHub user's agent-attributed commits per day by reading the
 * commits themselves, which the contribution calendar doesn't expose.
 *
 * Which commits count mirrors GitHub's own contribution graph as closely as
 * the API allows:
 * - Repositories come from `commitContributionsByRepository`, so forks and
 *   repos GitHub doesn't credit are already excluded.
 * - Only the default branch is read (the graph also counts `gh-pages`).
 * - A commit counts when the user is the git author **or a co-author**.
 *   `Commit.authors` resolves both, which is why this reads unfiltered
 *   history instead of `history(author:)`: that filter only matches the git
 *   author, and would drop exactly the commits an agent authored with the
 *   user as co-author.
 * - The day comes from the git author date in the commit's own time zone,
 *   which is what GitHub's graph uses.
 *
 * Cost is bounded by MAX_REPOSITORIES and MAX_HISTORY_PAGES, so very active
 * shared repositories can be undercounted. Agent counts are a lower bound
 * anyway (see `agent-attribution.ts`).
 *
 * Call this only with the user's own OAuth token for their own login: it
 * reads private repositories, and the result must never land in a shared
 * cache.
 */

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
/** GitHub's own cap for `commitContributionsByRepository`. */
export const MAX_REPOSITORIES = 25;
/** Repositories read per GraphQL request, via aliases. */
const REPOSITORIES_PER_REQUEST = 5;
const HISTORY_PAGE_SIZE = 100;
/** Pages of history read per repository, i.e. 300 commits. */
export const MAX_HISTORY_PAGES = 3;
/** Co-authors read per commit; the git author is always first. */
const MAX_AUTHORS_PER_COMMIT = 10;

export interface GithubAgentTally {
  /** Agent-attributed commits per `YYYY-MM-DD`, across every repo read. */
  agentCounts: Map<string, number>;
  agentBreakdown: Partial<Record<AgentId, number>>;
  /**
   * The same count restricted to public repositories. This is the only part
   * that may be saved for visitors: the rest includes private repos.
   */
  publicTotals: AgentTotals;
}

export interface FetchGithubAgentTallyOptions {
  token: string;
  login: string;
  /** Inclusive `YYYY-MM-DD`. */
  from: string;
  /** Inclusive `YYYY-MM-DD`. */
  to: string;
}

interface RepositoryTarget {
  owner: string;
  name: string;
  /** `visibility === 'PUBLIC'`. Internal (enterprise) repos are not public. */
  isPublic: boolean;
  /** Commits GitHub credits the user with here, when known; used to stop paging early. */
  expectedCommits: number | null;
  matchedCommits: number;
  cursor: string | null;
  pagesRead: number;
  done: boolean;
}

interface HistoryCommit {
  message: string;
  author: {
    name: string | null;
    email: string | null;
    /** Git timestamp with the commit's own offset, e.g. `2025-05-01T23:30:00-07:00`. */
    date: string | null;
    user: { login: string } | null;
  } | null;
  authors: { nodes: Array<{ user: { login: string } | null } | null> };
}

interface HistoryConnection {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: Array<HistoryCommit | null>;
}

const REPOSITORIES_QUERY = `
  query($login: String!, $from: DateTime, $to: DateTime) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        commitContributionsByRepository(maxRepositories: ${MAX_REPOSITORIES}) {
          repository {
            name
            owner { login }
            visibility
          }
          contributions(first: 100) {
            pageInfo { hasNextPage }
            nodes { commitCount }
          }
        }
      }
    }
  }
`;

export async function fetchGithubAgentTally({
  token,
  login,
  from,
  to,
}: FetchGithubAgentTallyOptions): Promise<GithubAgentTally> {
  const tally: GithubAgentTally = {
    agentCounts: new Map(),
    agentBreakdown: {},
    publicTotals: { agentContributions: 0, agentBreakdown: {} },
  };
  const normalizedLogin = login.toLowerCase();
  const repositories = await fetchRepositoryTargets(token, login, from, to);

  for (
    let index = 0;
    index < repositories.length;
    index += REPOSITORIES_PER_REQUEST
  ) {
    const batch = repositories.slice(index, index + REPOSITORIES_PER_REQUEST);

    while (batch.some((repo) => !repo.done)) {
      const pending = batch.filter((repo) => !repo.done);
      const histories = await fetchHistoryPage(token, pending, from, to);

      pending.forEach((repo, position) => {
        const history = histories[position];
        repo.pagesRead += 1;

        for (const commit of history?.nodes ?? []) {
          if (!commit || !isCommitByUser(commit, normalizedLogin)) continue;
          if (tallyCommit(commit, from, to, repo.isPublic, tally)) {
            repo.matchedCommits += 1;
          }
        }

        repo.cursor = history?.pageInfo.endCursor ?? null;
        repo.done =
          !history?.pageInfo.hasNextPage ||
          !repo.cursor ||
          repo.pagesRead >= MAX_HISTORY_PAGES ||
          (repo.expectedCommits !== null &&
            repo.matchedCommits >= repo.expectedCommits);
      });
    }
  }

  return tally;
}

async function fetchRepositoryTargets(
  token: string,
  login: string,
  from: string,
  to: string,
): Promise<RepositoryTarget[]> {
  const data = await githubGraphql<{
    user: {
      contributionsCollection: {
        commitContributionsByRepository: Array<{
          repository: {
            name: string;
            owner: { login: string };
            visibility?: string;
          };
          contributions: {
            pageInfo: { hasNextPage: boolean };
            nodes: Array<{ commitCount: number } | null>;
          };
        }>;
      };
    } | null;
  }>(token, REPOSITORIES_QUERY, {
    login,
    from: toStartOfDayIso(from),
    to: toExclusiveUpperBoundIso(to),
  });

  const entries =
    data.user?.contributionsCollection.commitContributionsByRepository ?? [];

  return entries.map(({ repository, contributions }) => ({
    owner: repository.owner.login,
    name: repository.name,
    isPublic: repository.visibility === 'PUBLIC',
    // Each node is one day; with more than 100 days the total is unknown.
    expectedCommits: contributions.pageInfo.hasNextPage
      ? null
      : contributions.nodes.reduce(
          (sum, node) => sum + (node?.commitCount ?? 0),
          0,
        ),
    matchedCommits: 0,
    cursor: null,
    pagesRead: 0,
    done: false,
  }));
}

/** Fetches the next history page for each repository in one aliased query. */
async function fetchHistoryPage(
  token: string,
  repositories: RepositoryTarget[],
  from: string,
  to: string,
): Promise<Array<HistoryConnection | null>> {
  const variableDefinitions = [
    '$since: GitTimestamp!',
    '$until: GitTimestamp!',
  ];
  const variables: Record<string, string | null> = {
    // Pad a day either side: `since`/`until` filter on a UTC instant, but the
    // day a commit belongs to comes from its own offset. tallyCommit drops
    // anything outside the range.
    since: shiftDays(from, -1),
    until: shiftDays(to, 2),
  };

  const fields = repositories.map((repo, index) => {
    variableDefinitions.push(
      `$owner${index}: String!`,
      `$name${index}: String!`,
      `$after${index}: String`,
    );
    variables[`owner${index}`] = repo.owner;
    variables[`name${index}`] = repo.name;
    variables[`after${index}`] = repo.cursor;

    return `
      r${index}: repository(owner: $owner${index}, name: $name${index}) {
        defaultBranchRef {
          target {
            ... on Commit {
              history(first: ${HISTORY_PAGE_SIZE}, since: $since, until: $until, after: $after${index}) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  message
                  author { name email date user { login } }
                  authors(first: ${MAX_AUTHORS_PER_COMMIT}) { nodes { user { login } } }
                }
              }
            }
          }
        }
      }`;
  });

  const query = `query(${variableDefinitions.join(', ')}) {${fields.join('')}\n}`;
  const data = await githubGraphql<
    Record<
      string,
      {
        defaultBranchRef: {
          target: { history?: HistoryConnection } | null;
        } | null;
      } | null
    >
  >(token, query, variables, { allowPartial: true });

  return repositories.map(
    (_, index) => data[`r${index}`]?.defaultBranchRef?.target?.history ?? null,
  );
}

function isCommitByUser(commit: HistoryCommit, login: string): boolean {
  return commit.authors.nodes.some(
    (author) => author?.user?.login.toLowerCase() === login,
  );
}

/**
 * Adds a commit to the agent tally if it falls in the range. Returns whether
 * it was in range, agent-attributed or not, so callers can track how many of
 * the user's credited commits they've seen.
 */
function tallyCommit(
  commit: HistoryCommit,
  from: string,
  to: string,
  isPublicRepository: boolean,
  tally: GithubAgentTally,
): boolean {
  const date = commit.author?.date?.slice(0, 10);
  if (!date || date < from || date > to) return false;

  const attributions = detectAgents({
    message: commit.message,
    authorName: commit.author?.name,
    authorEmail: commit.author?.email,
    authorLogin: commit.author?.user?.login,
  });
  if (attributions.length === 0) return true;

  tally.agentCounts.set(date, (tally.agentCounts.get(date) ?? 0) + 1);
  for (const { agent } of attributions) {
    tally.agentBreakdown[agent] = (tally.agentBreakdown[agent] ?? 0) + 1;
  }

  if (isPublicRepository) {
    const totals = tally.publicTotals;
    totals.agentContributions += 1;
    for (const { agent } of attributions) {
      totals.agentBreakdown[agent] = (totals.agentBreakdown[agent] ?? 0) + 1;
    }
  }
  return true;
}

function shiftDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString();
}

/**
 * With `allowPartial`, a response that has both `errors` and `data` returns
 * the data. GitHub does this when some aliased repositories are unreadable
 * (SAML-protected org, revoked access); those come back null and are skipped.
 */
async function githubGraphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  { allowPartial = false }: { allowPartial?: boolean } = {},
): Promise<T> {
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': APP_USER_AGENT,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }

  const json = await response.json();
  if (json.errors && !(allowPartial && json.data)) {
    throw new Error(
      json.errors.map((e: { message: string }) => e.message).join('; '),
    );
  }
  return json.data as T;
}
