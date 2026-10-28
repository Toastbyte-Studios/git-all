-- Agent-attribution summaries shown to visitors of a public profile.
--
-- Visitors can't compute GitHub agent counts: that needs the owner's OAuth
-- token, which only ever lives in the owner's encrypted cookie. So when the
-- owner looks up their own GitHub data, `/api/github` saves a summary here,
-- and `/u/[handle]` shows it to everyone else.
--
-- What is stored is deliberately small and public-safe:
--   - totals and a per-agent breakdown only, no per-day split;
--   - public repositories only (`visibility = PUBLIC`), never private or
--     internal ones, since the owner's token can read both;
--   - rows are written only while `users.show_agent_attribution = 1`, and are
--     deleted when the owner turns it off or deletes their account.
--
-- `provider` is part of the key so other platforms that need a token can save
-- here too. Bitbucket doesn't: its agent counts come from public commits and
-- are computed live for every visitor.

CREATE TABLE IF NOT EXISTS agent_summaries (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,               -- 'github'
  agent_contributions INTEGER NOT NULL,
  agent_breakdown TEXT NOT NULL,        -- JSON object, agent id -> count
  range_from TEXT NOT NULL,             -- inclusive YYYY-MM-DD
  range_to TEXT NOT NULL,               -- inclusive YYYY-MM-DD
  computed_at INTEGER NOT NULL,         -- unix ms
  PRIMARY KEY (user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
