-- Add opt-out flag for staffing alert emails
ALTER TABLE organizations
  ADD COLUMN disable_staffing_alerts BOOLEAN NOT NULL DEFAULT false;
