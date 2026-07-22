-- Add profile visibility flag.
-- Defaults to 1 (public) so all existing profiles remain visible.
ALTER TABLE users ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1;
