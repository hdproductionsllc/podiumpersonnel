-- Add W-9 file URL column so musicians can upload their W-9 via the portal.
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS w9_file_url TEXT;

-- Create a private storage bucket for W-9 documents.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'w9-documents',
  'w9-documents',
  false,
  5242880, -- 5MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Musicians can upload W-9 files into their own folder (user_id as folder name).
CREATE POLICY "Musicians upload own W9"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'w9-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Musicians can view their own W-9 files.
CREATE POLICY "Musicians read own W9"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'w9-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Musicians can update (replace) their own W-9 files.
CREATE POLICY "Musicians update own W9"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'w9-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Musicians can delete their own W-9 files.
CREATE POLICY "Musicians delete own W9"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'w9-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role (admin) can read all W-9 files.
CREATE POLICY "Admin read all W9"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'w9-documents'
  AND auth.role() = 'service_role'
);
