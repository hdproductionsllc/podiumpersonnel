-- No public/anon storage policies. Uploads are authorized by the existing report
-- token; reads require an owner/admin membership for the report's organization.
-- Photos are not publication consent and are never automatically published.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('gig-report-photos', 'gig-report-photos', false, 3145728, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;
