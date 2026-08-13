-- Retired handles.
--
-- `setHandle()` lets a user rename every 7 days. Before this table, a rename
-- silently 404'd every `/u/<old>` link and every `/embed/u/<old>.svg` already
-- pasted into somebody else's README — an invisible failure on a page we do
-- not control and cannot instrument.
--
-- Two properties matter here, and the second is the one that is hard to add
-- later:
--
--   1. Continuity. Old handles resolve to the owner's current handle, so
--      shared links and embeds keep working after a rename.
--
--   2. Reservation. A released handle stays bound to its previous owner and
--      cannot be claimed by anyone else. Without this, renaming frees the
--      handle for immediate registration, and whoever takes it inherits every
--      embed already pointing at it — their heatmap silently replaces the
--      original owner's on pages neither of them controls. Recycling a handle
--      that is embedded elsewhere is an impersonation vector, not just a
--      broken link.
--
-- `handle` is the primary key rather than `(handle, user_id)`: a handle can
-- only ever have been released by one user at a time, and the redirect lookup
-- needs a single unambiguous row.
--
-- Rows are cascaded on user deletion by the FK below, and `deleteUser()` also
-- deletes them explicitly — D1 only enforces foreign keys with
-- `PRAGMA foreign_keys = ON`, and an erasure path should not depend on that.

CREATE TABLE IF NOT EXISTS handle_history (
  handle TEXT PRIMARY KEY,              -- the released handle
  user_id TEXT NOT NULL,                -- who released it, and who still owns it
  released_at INTEGER NOT NULL,         -- unix ms
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_handle_history_user_id ON handle_history(user_id);
