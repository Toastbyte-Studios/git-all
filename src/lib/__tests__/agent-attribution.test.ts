import { describe, it, expect } from 'vitest';
import {
  AGENT_SIGNATURES,
  detectAgent,
  detectAgents,
  matchAgentEmail,
  matchAgentLogin,
  parseCoAuthors,
} from '../agent-attribution';

describe('AGENT_SIGNATURES', () => {
  it('has one entry per agent', () => {
    const agents = AGENT_SIGNATURES.map((s) => s.agent);
    expect(new Set(agents).size).toBe(agents.length);
  });

  it('stores emails and logins lowercased so lookups stay case-insensitive', () => {
    for (const signature of AGENT_SIGNATURES) {
      for (const value of [...signature.emails, ...signature.botLogins]) {
        expect(value).toBe(value.toLowerCase());
      }
    }
  });

  it('only lists [bot] accounts as bare logins', () => {
    for (const signature of AGENT_SIGNATURES) {
      for (const login of signature.botLogins) {
        expect(login.endsWith('[bot]')).toBe(true);
      }
    }
  });
});

describe('parseCoAuthors', () => {
  it('returns an empty list for missing or trailer-free messages', () => {
    expect(parseCoAuthors(undefined)).toEqual([]);
    expect(parseCoAuthors(null)).toEqual([]);
    expect(parseCoAuthors('fix: typo')).toEqual([]);
  });

  it('parses a trailer in the final paragraph', () => {
    const message =
      'feat: add thing\n\nCo-authored-by: Jane Doe <jane@example.com>';
    expect(parseCoAuthors(message)).toEqual([
      { name: 'Jane Doe', email: 'jane@example.com' },
    ]);
  });

  it('is case-insensitive on the trailer key', () => {
    const message =
      'x\n\nCO-AUTHORED-BY: Claude Opus 4 <noreply@anthropic.com>';
    expect(parseCoAuthors(message)).toEqual([
      { name: 'Claude Opus 4', email: 'noreply@anthropic.com' },
    ]);
  });

  it('finds trailers nested mid-message by a squash merge', () => {
    const message = [
      'Fix cache dedupe (#294)',
      '',
      '* Initial plan',
      '',
      '* Address review feedback',
      '',
      'Co-authored-by: dev <61821107+dev@users.noreply.github.com>',
      '',
      '---------',
      '',
      'Co-authored-by: copilot-swe-agent[bot] <198982749+Copilot@users.noreply.github.com>',
    ].join('\n');
    expect(parseCoAuthors(message).map((c) => c.email)).toEqual([
      '61821107+dev@users.noreply.github.com',
      '198982749+Copilot@users.noreply.github.com',
    ]);
  });

  it('deduplicates repeated co-authors by email, ignoring case', () => {
    const message = [
      'x',
      '',
      'Co-authored-by: Copilot <198982749+Copilot@users.noreply.github.com>',
      'Co-authored-by: Copilot <198982749+copilot@users.noreply.github.com>',
    ].join('\n');
    expect(parseCoAuthors(message)).toHaveLength(1);
  });

  it('handles CRLF line endings and indentation', () => {
    const message =
      'x\r\n\r\n    Co-authored-by: Cursor <cursoragent@cursor.com>\r\n';
    expect(parseCoAuthors(message)).toEqual([
      { name: 'Cursor', email: 'cursoragent@cursor.com' },
    ]);
  });

  it('ignores the phrase when it is not a trailer line', () => {
    const message =
      'docs: explain the Co-authored-by: Cursor <cursoragent@cursor.com> format';
    expect(parseCoAuthors(message)).toEqual([]);
  });

  it('ignores trailers with no email', () => {
    expect(parseCoAuthors('x\n\nCo-authored-by: Someone')).toEqual([]);
  });
});

describe('matchAgentEmail', () => {
  it.each([
    ['noreply@anthropic.com', 'claude'],
    ['242468646+Claude@users.noreply.github.com', 'claude'],
    ['198982749+Copilot@users.noreply.github.com', 'copilot'],
    ['175728472+Copilot@users.noreply.github.com', 'copilot'],
    ['cursoragent@cursor.com', 'cursor'],
    ['noreply@openai.com', 'codex'],
    ['158243242+devin-ai-integration[bot]@users.noreply.github.com', 'devin'],
    ['copilot-swe-agent[bot]@users.noreply.github.com', 'copilot'],
    ['  NOREPLY@Anthropic.com  ', 'claude'],
  ] as const)('maps %s to %s', (email, agent) => {
    expect(matchAgentEmail(email)).toBe(agent);
  });

  it.each([
    'jane@example.com',
    'noreply@github.com',
    // A human account named Copilot/Claude with a different ID must not match.
    '12345+Copilot@users.noreply.github.com',
    '12345+claude@users.noreply.github.com',
    'support@anthropic.com',
    '',
  ])('does not match %s', (email) => {
    expect(matchAgentEmail(email)).toBeNull();
  });

  it('returns null for missing input', () => {
    expect(matchAgentEmail(undefined)).toBeNull();
    expect(matchAgentEmail(null)).toBeNull();
  });
});

describe('matchAgentLogin', () => {
  it.each([
    ['copilot-swe-agent[bot]', 'copilot'],
    ['anthropic-code-agent[bot]', 'claude'],
    ['devin-ai-integration[bot]', 'devin'],
    ['Copilot-SWE-Agent[bot]', 'copilot'],
  ] as const)('maps %s to %s', (login, agent) => {
    expect(matchAgentLogin(login)).toBe(agent);
  });

  it.each(['octocat', 'Copilot', 'claude', 'dependabot[bot]', ''])(
    'does not match %s',
    (login) => {
      expect(matchAgentLogin(login)).toBeNull();
    },
  );
});

describe('detectAgents', () => {
  it('returns nothing for a plain human commit', () => {
    expect(
      detectAgents({
        message: 'fix: off-by-one in calendar',
        authorName: 'Jane',
        authorEmail: 'jane@example.com',
        authorLogin: 'jane',
      }),
    ).toEqual([]);
  });

  it('detects a Claude Code co-author trailer', () => {
    expect(
      detectAgents({
        message:
          'feat: add embed theme\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>',
        authorEmail: 'jane@example.com',
      }),
    ).toEqual([{ agent: 'claude', signal: 'co-author-trailer' }]);
  });

  it('detects a Copilot coding agent commit by author login', () => {
    expect(
      detectAgents({
        message: 'Initial plan',
        authorLogin: 'copilot-swe-agent[bot]',
      }),
    ).toEqual([{ agent: 'copilot', signal: 'author' }]);
  });

  it('detects an agent author from email when no login is available', () => {
    expect(
      detectAgents({
        authorName: 'copilot-swe-agent[bot]',
        authorEmail: '198982749+Copilot@users.noreply.github.com',
      }),
    ).toEqual([{ agent: 'copilot', signal: 'author' }]);
  });

  it('prefers the author signal over a trailer for the same agent', () => {
    expect(
      detectAgents({
        authorLogin: 'copilot-swe-agent[bot]',
        message:
          'x\n\nCo-authored-by: copilot-swe-agent[bot] <198982749+Copilot@users.noreply.github.com>',
      }),
    ).toEqual([{ agent: 'copilot', signal: 'author' }]);
  });

  it('returns every distinct agent, author first then trailers in order', () => {
    expect(
      detectAgents({
        authorLogin: 'devin-ai-integration[bot]',
        message: [
          'x',
          '',
          'Co-authored-by: Cursor <cursoragent@cursor.com>',
          'Co-authored-by: Jane <jane@example.com>',
          'Co-authored-by: Codex <noreply@openai.com>',
          'Co-authored-by: Cursor <cursoragent@cursor.com>',
        ].join('\n'),
      }),
    ).toEqual([
      { agent: 'devin', signal: 'author' },
      { agent: 'cursor', signal: 'co-author-trailer' },
      { agent: 'codex', signal: 'co-author-trailer' },
    ]);
  });

  it('tolerates an empty input object', () => {
    expect(detectAgents({})).toEqual([]);
  });
});

describe('detectAgent', () => {
  it('returns the primary attribution', () => {
    expect(
      detectAgent({
        authorLogin: 'anthropic-code-agent[bot]',
        message: 'x\n\nCo-authored-by: Cursor <cursoragent@cursor.com>',
      }),
    ).toEqual({ agent: 'claude', signal: 'author' });
  });

  it('returns null when no agent is attributed', () => {
    expect(detectAgent({ message: 'chore: bump deps' })).toBeNull();
  });
});
