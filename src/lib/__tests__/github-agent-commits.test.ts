import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_HISTORY_PAGES,
  fetchGithubAgentTally,
} from '../github-agent-commits';

const OWNER = 'monalisa';
const RANGE = {
  token: 'user-token',
  login: OWNER,
  from: '2025-05-01',
  to: '2025-05-03',
};

interface FakeCommit {
  message?: string;
  date: string;
  authorLogin?: string | null;
  authorName?: string;
  authorEmail?: string;
  /** Logins resolved by GitHub for the author and every co-author. */
  authors: Array<string | null>;
}

interface FakeRepo {
  owner?: string;
  name: string;
  /** Days of contributions GitHub credits; summed for the expected count. */
  creditedDays?: number[];
  /** Pages of history, newest first. `null` repo means no default branch. */
  pages: FakeCommit[][] | null;
}

function commit(overrides: Partial<FakeCommit> & { date: string }): FakeCommit {
  return {
    message: 'chore: tidy',
    authorLogin: OWNER,
    authorName: 'Mona',
    authorEmail: 'mona@example.com',
    authors: [OWNER],
    ...overrides,
  };
}

function toNode(c: FakeCommit) {
  return {
    message: c.message ?? '',
    author: {
      name: c.authorName ?? null,
      email: c.authorEmail ?? null,
      date: c.date,
      user: c.authorLogin ? { login: c.authorLogin } : null,
    },
    authors: {
      nodes: c.authors.map((login) => ({ user: login ? { login } : null })),
    },
  };
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Serves the repository query and aliased history queries from fixtures,
 * paging by the `after` cursor (`page-N`).
 */
function stubGithub(repos: FakeRepo[], extra: { errorsFor?: string[] } = {}) {
  const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
    const { query, variables } = JSON.parse(String(init?.body));

    if (query.includes('commitContributionsByRepository')) {
      return json({
        data: {
          user: {
            contributionsCollection: {
              commitContributionsByRepository: repos.map((repo) => ({
                repository: {
                  name: repo.name,
                  owner: { login: repo.owner ?? OWNER },
                },
                contributions: {
                  pageInfo: { hasNextPage: false },
                  nodes: (repo.creditedDays ?? [9999]).map((commitCount) => ({
                    commitCount,
                  })),
                },
              })),
            },
          },
        },
      });
    }

    const data: Record<string, unknown> = {};
    const errors: Array<{ message: string }> = [];
    for (let index = 0; `owner${index}` in variables; index += 1) {
      const name = variables[`name${index}`];
      const repo = repos.find((r) => r.name === name);
      if (!repo || extra.errorsFor?.includes(name)) {
        data[`r${index}`] = null;
        errors.push({ message: `Could not resolve ${name}` });
        continue;
      }
      if (!repo.pages) {
        data[`r${index}`] = { defaultBranchRef: null };
        continue;
      }
      const after: string | null = variables[`after${index}`];
      const pageIndex = after ? Number(after.replace('page-', '')) : 0;
      const page = repo.pages[pageIndex] ?? [];
      const hasNextPage = pageIndex + 1 < repo.pages.length;
      data[`r${index}`] = {
        defaultBranchRef: {
          target: {
            history: {
              pageInfo: {
                hasNextPage,
                endCursor: hasNextPage ? `page-${pageIndex + 1}` : null,
              },
              nodes: page.map(toNode),
            },
          },
        },
      };
    }

    return json(errors.length ? { data, errors } : { data });
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function historyCalls(fetchMock: ReturnType<typeof stubGithub>) {
  return fetchMock.mock.calls
    .map(([, init]) => JSON.parse(String(init?.body)))
    .filter(({ query }) => !query.includes('commitContributionsByRepository'));
}

describe('fetchGithubAgentTally', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('counts own and co-authored agent commits, and ignores everything else', async () => {
    stubGithub([
      {
        name: 'app',
        pages: [
          [
            // Owner authored, Claude co-author trailer.
            commit({
              date: '2025-05-03T10:00:00+00:00',
              message:
                'feat: x\n\nCo-Authored-By: Claude Opus 4 <noreply@anthropic.com>',
            }),
            // Copilot authored with the owner as co-author.
            commit({
              date: '2025-05-02T09:00:00+00:00',
              message: 'fix: y\n\nCo-authored-by: monalisa <mona@example.com>',
              authorLogin: null,
              authorName: 'Copilot',
              authorEmail: '198982749+Copilot@users.noreply.github.com',
              authors: [null, OWNER],
            }),
            // Owner, no agent.
            commit({ date: '2025-05-02T08:00:00+00:00' }),
            // Someone else's agent commit.
            commit({
              date: '2025-05-01T12:00:00+00:00',
              message: 'x\n\nCo-authored-by: Cursor <cursoragent@cursor.com>',
              authorLogin: 'octocat',
              authors: ['octocat'],
            }),
          ],
        ],
      },
    ]);

    const tally = await fetchGithubAgentTally(RANGE);

    expect(Object.fromEntries(tally.agentCounts)).toEqual({
      '2025-05-03': 1,
      '2025-05-02': 1,
    });
    expect(tally.agentBreakdown).toEqual({ claude: 1, copilot: 1 });
  });

  it('matches the owner login case-insensitively', async () => {
    stubGithub([
      {
        name: 'app',
        pages: [
          [
            commit({
              date: '2025-05-01T10:00:00Z',
              message: 'x\n\nCo-authored-by: Cursor <cursoragent@cursor.com>',
              authors: ['MonaLisa'],
            }),
          ],
        ],
      },
    ]);

    const tally = await fetchGithubAgentTally(RANGE);
    expect(tally.agentBreakdown).toEqual({ cursor: 1 });
  });

  it("buckets by the commit's own time zone and drops out-of-range days", async () => {
    stubGithub([
      {
        name: 'app',
        pages: [
          [
            // 2025-05-04 in UTC, but 2025-05-03 where it was written.
            commit({
              date: '2025-05-03T23:30:00-07:00',
              message: 'x\n\nCo-authored-by: Codex <noreply@openai.com>',
            }),
            // Padding returns these, but they're outside the range.
            commit({
              date: '2025-05-04T01:00:00+00:00',
              message: 'x\n\nCo-authored-by: Codex <noreply@openai.com>',
            }),
            commit({
              date: '2025-04-30T22:00:00+00:00',
              message: 'x\n\nCo-authored-by: Codex <noreply@openai.com>',
            }),
          ],
        ],
      },
    ]);

    const tally = await fetchGithubAgentTally(RANGE);

    expect(Object.fromEntries(tally.agentCounts)).toEqual({ '2025-05-03': 1 });
    expect(tally.agentBreakdown).toEqual({ codex: 1 });
  });

  it('pads the history window by a day either side', async () => {
    const fetchMock = stubGithub([{ name: 'app', pages: [[]] }]);
    await fetchGithubAgentTally(RANGE);

    const [call] = historyCalls(fetchMock);
    expect(call?.variables).toMatchObject({
      since: '2025-04-30T00:00:00.000Z',
      until: '2025-05-05T00:00:00.000Z',
    });
  });

  it('follows the cursor and stops after MAX_HISTORY_PAGES', async () => {
    const page = [
      commit({ date: '2025-05-01T10:00:00Z', authors: ['someone'] }),
    ];
    const fetchMock = stubGithub([
      {
        name: 'busy',
        pages: Array.from({ length: MAX_HISTORY_PAGES + 2 }, () => page),
      },
    ]);

    await fetchGithubAgentTally(RANGE);

    const calls = historyCalls(fetchMock);
    expect(calls).toHaveLength(MAX_HISTORY_PAGES);
    expect(calls.map((c) => c.variables.after0)).toEqual([
      null,
      'page-1',
      'page-2',
    ]);
  });

  it('stops paging once every credited commit has been seen', async () => {
    const fetchMock = stubGithub([
      {
        name: 'app',
        creditedDays: [1],
        pages: [
          [commit({ date: '2025-05-01T10:00:00Z' })],
          [commit({ date: '2025-05-01T09:00:00Z', authors: ['someone'] })],
        ],
      },
    ]);

    await fetchGithubAgentTally(RANGE);
    expect(historyCalls(fetchMock)).toHaveLength(1);
  });

  it('reads repositories five to a request', async () => {
    const fetchMock = stubGithub(
      Array.from({ length: 7 }, (_, i) => ({ name: `repo-${i}`, pages: [[]] })),
    );

    await fetchGithubAgentTally(RANGE);

    const calls = historyCalls(fetchMock);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.variables).toHaveProperty('name4', 'repo-4');
    expect(calls[0]?.variables).not.toHaveProperty('name5');
    expect(calls[1]?.variables).toMatchObject({
      name0: 'repo-5',
      name1: 'repo-6',
    });
  });

  it('passes repository names as variables, not inline in the query', async () => {
    const fetchMock = stubGithub([{ name: 'app', pages: [[]] }]);
    await fetchGithubAgentTally(RANGE);

    const [call] = historyCalls(fetchMock);
    expect(call?.query).not.toContain('"app"');
    expect(call?.variables).toMatchObject({ owner0: OWNER, name0: 'app' });
  });

  it('skips unreadable or empty repositories and keeps the rest', async () => {
    stubGithub(
      [
        { name: 'saml-locked', pages: [[]] },
        { name: 'empty', pages: null },
        {
          name: 'app',
          pages: [
            [
              commit({
                date: '2025-05-02T10:00:00Z',
                message: 'x\n\nCo-authored-by: Cursor <cursoragent@cursor.com>',
              }),
            ],
          ],
        },
      ],
      { errorsFor: ['saml-locked'] },
    );

    const tally = await fetchGithubAgentTally(RANGE);
    expect(tally.agentBreakdown).toEqual({ cursor: 1 });
  });

  it('returns an empty tally when there are no credited repositories', async () => {
    const fetchMock = stubGithub([]);
    const tally = await fetchGithubAgentTally(RANGE);

    expect(tally.agentCounts.size).toBe(0);
    expect(tally.agentBreakdown).toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the repository lookup fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        json({ errors: [{ message: 'Bad credentials' }] }),
      ),
    );

    await expect(fetchGithubAgentTally(RANGE)).rejects.toThrow(
      'Bad credentials',
    );
  });
});
