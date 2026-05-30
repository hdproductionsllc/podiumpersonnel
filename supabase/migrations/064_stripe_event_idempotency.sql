-- Idempotency log for Stripe webhook events.
--
-- Stripe retries webhooks (and may deliver out of order), so the handler must
-- process each event id at most once. We record every event id here the first
-- time we see it; a duplicate insert (unique-violation on the PK) tells the
-- handler the event was already processed and can be safely ignored.

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only the service-role webhook reads/writes this table; service role bypasses
-- RLS. Enable RLS with no policies so nothing else can touch it.
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
