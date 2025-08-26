-- app/migrations/003_meeting_locations_and_finalize.sql

-- Add columns on meetings for radius, status, finalized json
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS radius_meters INTEGER DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'collecting' CHECK (status IN ('collecting','finalized')),
  ADD COLUMN IF NOT EXISTS finalized_place_json JSONB;

-- Add role to invitations
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'invitee' CHECK (role IN ('owner','invitee')),
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- meeting_locations: either user_id or email must identify the participant; we enforce uniqueness on (meeting_id, email)
CREATE TABLE IF NOT EXISTS meeting_locations (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  provided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meeting_id, email)
);
