-- 072: Spotify connections (Book Builder — auto-built playlists)
--
-- One Spotify account connection per organization. The owner connects once
-- (OAuth authorization-code flow); Podium stores the refresh token and builds
-- playlists from confirmed intakes on demand ("Smith Wedding — July 26, 2026"),
-- writing the playlist URL back onto the intake so it flows to the playlist
-- PDFs and the gig page.
--
-- SECURITY: this table holds OAuth tokens. RLS is ENABLED with NO user
-- policies on purpose — no user session can read it via PostgREST; only the
-- service-role key (the API routes) can touch it.
--
-- Additive only.

CREATE TABLE spotify_connections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  spotify_user_id  TEXT NOT NULL,
  display_name     TEXT,
  refresh_token    TEXT NOT NULL,
  access_token     TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON spotify_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE spotify_connections ENABLE ROW LEVEL SECURITY;
-- No policies: user sessions get nothing; the service role bypasses RLS.

-- ===========================================================================
-- verify: table exists with RLS on and ZERO policies
-- SELECT tablename, rowsecurity FROM pg_tables
--  WHERE schemaname='public' AND tablename='spotify_connections';
-- Expected: one row, rowsecurity = t.
-- SELECT count(*) FROM pg_policies
--  WHERE schemaname='public' AND tablename='spotify_connections';
-- Expected: 0.
