-- Add body column to email_logs so we can display email content in the dashboard
ALTER TABLE email_logs ADD COLUMN body TEXT;
