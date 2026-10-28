/**
 * Detects commits attributed to AI coding agents (Claude, Copilot, Cursor,
 * Codex, Devin) from the metadata already on a commit: the author identity
 * and any `Co-authored-by:` trailers in the message.
 *
 * This is a pure, provider-agnostic classifier. Each platform route maps its
 * own commit shape onto `AgentCommitInput`, so the signatures live in one
 * place and are tested once.
 *
 * IMPORTANT — what a match does and does not mean:
 * Every signal here is self-reported. Agents add trailers by default (or not,
 * depending on the agent and the user's config), and anyone can remove them
 * with an amend or a squash. A match means "this commit is *attributed* to an
 * agent", never "an agent wrote this code". A miss means nothing at all —
 * Codex in particular often leaves no trace on the commit. UI copy built on
 * this should say "agent-attributed", not "AI-written".
 */

export type AgentId = 'claude' | 'copilot' | 'cursor' | 'codex' | 'devin';

/** Where the match came from. Author matches are the stronger signal. */
export type AgentSignal = 'author' | 'co-author-trailer';

export interface AgentAttribution {
  agent: AgentId;
  signal: AgentSignal;
}

/**
 * The fields the classifier reads. All optional so providers can pass
 * whatever they have; a commit with only a message still gets trailer checks.
 */
export interface AgentCommitInput {
  message?: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
  /** The platform account that authored the commit, e.g. `copilot-swe-agent[bot]`. */
  authorLogin?: string | null;
}

export interface CoAuthor {
  name: string;
  email: string;
}

interface AgentSignature {
  agent: AgentId;
  /** Exact emails, compared case-insensitively. */
  emails: readonly string[];
  /**
   * Platform logins, compared case-insensitively. Also matched against the
   * login embedded in a GitHub noreply address (`<id>+<login>@users.noreply.github.com`).
   * Only `[bot]` logins belong here: humans can't register a `[bot]` name, so
   * matching on it is safe without pinning a numeric account ID.
   */
  botLogins: readonly string[];
}

/**
 * Known agent identities. Plain (non-`[bot]`) GitHub accounts such as
 * `Copilot` and `Claude` are matched by their full noreply email, which pins
 * the numeric account ID, so a human user who happens to share a display
 * name can't trip the match.
 *
 * Sources, checked 2026-10-28:
 * - Claude Code default trailer: `Co-Authored-By: <model> <noreply@anthropic.com>`.
 *   Claude via GitHub agent workflows: `anthropic-code-agent[bot]`.
 * - Copilot coding agent authors as `copilot-swe-agent[bot]`; applied Copilot
 *   suggestions and Copilot Autofix co-author as a second `Copilot` account
 *   (ID 175728472).
 * - Cursor agent trailer: `Cursor <cursoragent@cursor.com>`.
 * - Codex trailer `Codex <noreply@openai.com>` is behind the `codex_git_commit`
 *   feature flag and not on by default, so expect most Codex commits to miss.
 * - Devin authors and co-authors as `devin-ai-integration[bot]`.
 */
export const AGENT_SIGNATURES: readonly AgentSignature[] = [
  {
    agent: 'claude',
    emails: [
      'noreply@anthropic.com',
      '242468646+claude@users.noreply.github.com',
    ],
    botLogins: ['anthropic-code-agent[bot]'],
  },
  {
    agent: 'copilot',
    emails: [
      '198982749+copilot@users.noreply.github.com',
      '175728472+copilot@users.noreply.github.com',
    ],
    botLogins: ['copilot-swe-agent[bot]'],
  },
  {
    agent: 'cursor',
    emails: ['cursoragent@cursor.com'],
    botLogins: [],
  },
  {
    agent: 'codex',
    emails: ['noreply@openai.com'],
    botLogins: [],
  },
  {
    agent: 'devin',
    emails: [],
    botLogins: ['devin-ai-integration[bot]'],
  },
];

const GITHUB_NOREPLY_PATTERN =
  /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i;

/**
 * Matches a `Co-authored-by:` line anywhere in the message, case-insensitive.
 *
 * Git only treats lines in the final paragraph as trailers, but this
 * deliberately scans every line: squash-merging an agent's PR (the most
 * common way agent work lands) nests each original commit's trailers in the
 * middle of the squashed message.
 */
const CO_AUTHOR_LINE_PATTERN =
  /^[ \t>*-]*co-authored-by:[ \t]*(.*?)[ \t]*<([^<>\s]+)>[ \t]*$/gim;

/** Extracts every `Co-authored-by:` entry from a commit message, deduplicated by email. */
export function parseCoAuthors(message: string | null | undefined): CoAuthor[] {
  if (!message) return [];

  const seen = new Set<string>();
  const coAuthors: CoAuthor[] = [];

  for (const match of message.matchAll(CO_AUTHOR_LINE_PATTERN)) {
    const name = match[1]?.trim() ?? '';
    const email = match[2]?.trim() ?? '';
    const key = email.toLowerCase();
    if (!email || seen.has(key)) continue;
    seen.add(key);
    coAuthors.push({ name, email });
  }

  return coAuthors;
}

/** Returns the agent behind an email address, or `null` if it isn't a known agent identity. */
export function matchAgentEmail(
  email: string | null | undefined,
): AgentId | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();

  for (const signature of AGENT_SIGNATURES) {
    if (signature.emails.includes(normalized)) return signature.agent;
  }

  const noreplyLogin = normalized.match(GITHUB_NOREPLY_PATTERN)?.[1];
  return noreplyLogin ? matchAgentLogin(noreplyLogin) : null;
}

/** Returns the agent behind a platform login, or `null` if it isn't a known agent bot. */
export function matchAgentLogin(
  login: string | null | undefined,
): AgentId | null {
  if (!login) return null;
  const normalized = login.trim().toLowerCase();

  for (const signature of AGENT_SIGNATURES) {
    if (signature.botLogins.includes(normalized)) return signature.agent;
  }
  return null;
}

/**
 * Every agent attributed on a commit, one entry per agent. An author match
 * comes first and wins over a trailer match for the same agent; trailer
 * matches follow in message order.
 */
export function detectAgents(commit: AgentCommitInput): AgentAttribution[] {
  const attributions: AgentAttribution[] = [];
  const seen = new Set<AgentId>();

  const add = (agent: AgentId | null, signal: AgentSignal) => {
    if (!agent || seen.has(agent)) return;
    seen.add(agent);
    attributions.push({ agent, signal });
  };

  add(
    matchAgentLogin(commit.authorLogin) ?? matchAgentEmail(commit.authorEmail),
    'author',
  );

  for (const coAuthor of parseCoAuthors(commit.message)) {
    add(matchAgentEmail(coAuthor.email), 'co-author-trailer');
  }

  return attributions;
}

/** The primary agent attributed on a commit, or `null` for none. See `detectAgents`. */
export function detectAgent(commit: AgentCommitInput): AgentAttribution | null {
  return detectAgents(commit)[0] ?? null;
}
