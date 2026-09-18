-- 085: Scope the project-files storage bucket to the owning organization
--
-- THE HOLE
--   Migration 041 (lines 169-188) created three storage.objects policies whose
--   only condition was "is somebody logged in?":
--
--     bucket_id = 'project-files' AND auth.uid() IS NOT NULL
--
--   Every object in the bucket was therefore readable AND deletable by every
--   authenticated account in every tenant, and anyone could write objects into
--   any folder. The API routes do their own org checks, but nothing forces a
--   caller through them: the Storage SDK is in the browser bundle, and
--
--     supabase.storage.from('project-files').download('<orgId>/<projectId>/<uuid>.pdf')
--
--   goes straight to the storage API with the user's own session. Paths are not
--   secrets — an org id appears in URLs and payloads, and a project id is handed
--   out with every offer — so "unguessable" was never the guarantee. The DELETE
--   policy was worse than the read: any logged-in stranger could erase another
--   contractor's parts the week of the gig.
--
-- THE PATH LAYOUT THIS RELIES ON
--   Storage keys are minted in exactly one place,
--   src/app/api/projects/[projectId]/files/upload-url/route.ts:
--
--     const storagePath = `${membership.organization_id}/${projectId}/${fileId}.pdf`
--
--   and POST /api/projects/[projectId]/files re-validates the prefix before it
--   records the row. So the FIRST folder of every key is the owning
--   organization's uuid, which is what these policies test.
--
-- DEFENCE IN DEPTH, NOT THE PRIMARY GATE
--   Uploads use a signed upload token minted by the SERVICE ROLE, and
--   /api/music-download/[fileId] (the musician-facing, token-authenticated
--   download) signs its URL with the service role too — both bypass RLS. The
--   two caller-scoped operations are the admin download
--   (files/[fileId]/download → createSignedUrl) and the admin delete
--   (files/[fileId] → remove), and both routes have already verified that the
--   caller is a member (download) or an owner/admin (delete) of the org that
--   owns the file. So these policies never stand between a legitimate user and
--   their own file; they exist to stop the direct-SDK path that skips the routes.
--
-- SHARED LIBRARIES ARE NOT AFFECTED
--   organizations.library_org_id (migration 075, resolveLibraryOrgId() in
--   src/lib/api-helpers.ts) lets several brands read ONE music library. That
--   library's PDFs live in Cloudflare R2 (bucket podium-repertoire,
--   src/lib/storage/r2.ts; used by the library, repertoire and intake/book
--   routes), never in this Supabase bucket. The one place a shared-library file
--   reaches project-files is the Book Builder, which merges R2 sources in the
--   browser and uploads the finished book through the same upload-url route —
--   under the CALLER's organization id. There is therefore no legitimate
--   cross-org read of this bucket, and no library-org exception is needed. If a
--   future feature does need one, extend the SELECT policy with
--   is_org_member((SELECT library_org_id FROM organizations WHERE id = ...)).
--
-- WHY THE CASE WRAPPER
--   `(storage.foldername(name))[1]::uuid` raises 22P02 on any object whose first
--   folder is not a uuid. Postgres is free to reorder the AND operands, so a
--   plain `folder ~ uuid_regex AND folder::uuid` guard is not enough — a single
--   stray object could make the policy throw during a LIST instead of simply
--   denying. CASE fixes the evaluation order; a non-uuid folder yields NULL, and
--   is_org_member(NULL) is false, which is the denial we want.
--
-- Idempotent and safe to re-run.

-- 1. Remove the three "any logged-in user" policies from 041, and the new names
--    too, so this file can be applied twice.
DROP POLICY IF EXISTS "Org admins upload project files"          ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users read project files"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users delete project files" ON storage.objects;
DROP POLICY IF EXISTS "Org members read project files"           ON storage.objects;
DROP POLICY IF EXISTS "Org admins delete project files"          ON storage.objects;

-- 2. Recreate them org-scoped on the first path folder.

CREATE POLICY "Org admins upload project files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-files'
  AND is_org_admin(
    (CASE
       WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (storage.foldername(name))[1]
     END)::uuid
  )
);

CREATE POLICY "Org members read project files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-files'
  AND is_org_member(
    (CASE
       WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (storage.foldername(name))[1]
     END)::uuid
  )
);

CREATE POLICY "Org admins delete project files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-files'
  AND is_org_admin(
    (CASE
       WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (storage.foldername(name))[1]
     END)::uuid
  )
);

-- No UPDATE policy on purpose: nothing in the app overwrites an object in place
-- (a replaced book is a new uuid), and the bucket stays private (041 created it
-- with public = false).

-- verify: the three policies are org-scoped. Expect 3 rows, each mentioning
-- foldername and is_org_member/is_org_admin.
-- SELECT policyname, cmd, qual, with_check FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
--   AND coalesce(qual,'') || coalesce(with_check,'') LIKE '%project-files%';

-- verify: no object in the bucket has a non-uuid first folder (such a file would
-- become unreachable except through the service role). Expect 0 rows.
-- SELECT name FROM storage.objects
-- WHERE bucket_id = 'project-files'
--   AND (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- verify: every object's first folder is an org that exists. Expect 0 rows.
-- SELECT o.name FROM storage.objects o
-- WHERE o.bucket_id = 'project-files'
--   AND (storage.foldername(o.name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--   AND NOT EXISTS (
--     SELECT 1 FROM organizations g WHERE g.id = ((storage.foldername(o.name))[1])::uuid
--   );
