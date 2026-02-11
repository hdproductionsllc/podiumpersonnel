-- Files uploaded per project
CREATE TABLE project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  scope TEXT NOT NULL DEFAULT 'all',  -- 'all' = everyone, 'assigned' = specific instruments
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- Which instruments get which files (only for scope='assigned')
CREATE TABLE project_file_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  UNIQUE(file_id, instrument_id)
);

-- Track when admin sends music notifications
CREATE TABLE music_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by UUID NOT NULL REFERENCES auth.users(id),
  musician_count INT NOT NULL DEFAULT 0,
  notes TEXT
);

-- Per-musician confirmation
CREATE TABLE music_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id UUID NOT NULL REFERENCES music_sends(id) ON DELETE CASCADE,
  musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  email_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  UNIQUE(send_id, musician_id)
);

-- Track individual file downloads per musician
CREATE TABLE project_file_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
  musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_project_files_project ON project_files(project_id);
CREATE INDEX idx_music_sends_project ON music_sends(project_id);
CREATE INDEX idx_music_confirmations_token ON music_confirmations(token);
CREATE INDEX idx_project_file_downloads_file ON project_file_downloads(file_id);
CREATE INDEX idx_project_file_downloads_musician ON project_file_downloads(musician_id);

-- RLS for project_files
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view project files"
  ON project_files FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Org admins can insert project files"
  ON project_files FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "Org admins can delete project files"
  ON project_files FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- RLS for project_file_instruments
ALTER TABLE project_file_instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view file instruments"
  ON project_file_instruments FOR SELECT
  USING (file_id IN (
    SELECT id FROM project_files WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Org admins can insert file instruments"
  ON project_file_instruments FOR INSERT
  WITH CHECK (file_id IN (
    SELECT id FROM project_files WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  ));

-- RLS for music_sends
ALTER TABLE music_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view music sends"
  ON music_sends FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Org admins can insert music sends"
  ON music_sends FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- RLS for music_confirmations
ALTER TABLE music_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view music confirmations"
  ON music_confirmations FOR SELECT
  USING (send_id IN (
    SELECT id FROM music_sends WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Org admins can insert music confirmations"
  ON music_confirmations FOR INSERT
  WITH CHECK (send_id IN (
    SELECT id FROM music_sends WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  ));

-- RLS for project_file_downloads
ALTER TABLE project_file_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view downloads"
  ON project_file_downloads FOR SELECT
  USING (file_id IN (
    SELECT id FROM project_files WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Musicians can insert own downloads"
  ON project_file_downloads FOR INSERT
  WITH CHECK (musician_id IN (
    SELECT id FROM musicians WHERE user_id = auth.uid()
  ));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-files',
  'project-files',
  false,
  41943040,  -- 40MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Org admins upload project files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-files'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users read project files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-files'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users delete project files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-files'
  AND auth.uid() IS NOT NULL
);
