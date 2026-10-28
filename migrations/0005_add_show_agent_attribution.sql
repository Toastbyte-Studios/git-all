-- Opt-in flag for showing agent-attributed commits on the public profile.
--
-- Off by default, and unlike `is_public` (see 0002/0003) the column default is
-- 0 from the start, so existing rows and any INSERT that omits it stay off.
-- `upsertUser()` still names it explicitly, to match how `is_public` is
-- written and so the intent is visible at the INSERT.
--
-- This only governs what *visitors* see. The owner always sees their own
-- agent split, whatever this is set to.

ALTER TABLE users ADD COLUMN show_agent_attribution INTEGER NOT NULL DEFAULT 0;
