# Gig survey and photos: verification record

## Production deployment and live test (2026-10-25)

After explicit deployment approval, commit `ed832592858ea93fadcfeb243af0b5b27a76240b` deployed READY as `dpl_pvHqQ49NigFhShWbCHthfvb75wTb`, with `app.podiumpersonnel.com` assigned to that exact production deployment. The live browser test passed: upload, optional blank notes/client feedback, submission despite a corrupt photo, reload persistence, duplicate-image deduplication, JPEG resize/EXIF removal, signed storage read and expiry, anonymous/public rejection, unauthenticated admin-route rejection, invalid-image rejection and duplicate-submission protection. Zero email logs were created. Real customer records were not used.

The new live synthetic project `fae67e68-baa4-4035-8cbb-a45c921c29dd` and report `7c2a2314-a834-4fc1-a122-0dc668a71b0b` reuse the isolated no-member organization below. The gig was cancelled after testing, and further uploads return 404. One 16,018-byte, 2000x1333 synthetic JPEG remains private for review. Local evidence: `.verification/live-upload-result.json` and `.verification/live-upload-success.png`. No rows or objects were deleted.

Limits: no physical iPhone test or authenticated admin UI test. The test organization deliberately has no memberships; no credentials or access grants were created. Signed storage reads used the existing server client, while unit tests cover authorized admin route behavior. The CI database migration/RLS/constraint job passed. Initial CI unit assertions all passed, but Node reported an asynchronous FormData encoder error when the oversized test body was cancelled. The test helper now materializes multipart bytes before invoking the handler, retaining the size-limit check without the encoder cancellation race; runtime code is unchanged.

## Hosted schema result (2026-10-25)

The owner subsequently authorized the non-destructive schema migration. Applied successfully to **Podium Personnel** (`cyspguwdocseisjyjqmu`), confirmed against the existing app configuration's Supabase hostname. Hosted migration version **20261025181007**, name **concise_gig_report_and_photos**, contains only the two nullable answer columns and CHECK constraints. The local filename now matches the hosted version.

Post-apply checks: both columns are nullable with no default; both constraints are validated; 6 reports and 3 submitted reports remain; all new answers are NULL; the legacy-row checksum before/after is `65a8f37c7362c1e563791957a8df67ef`; report RLS remains enabled. No report content, policies, grants or credentials changed. No emails or app deployment occurred.

Private bucket creation is **complete**. After explicit approval on 2026-10-25 at 18:20:46 UTC, the state was rechecked and the previously denied operation was retried once successfully. Hosted migration **20261025182131_private_gig_report_photos** created `gig-report-photos`: `public=false`, `file_size_limit=3145728`, `allowed_mime_types=[image/jpeg]`. The local migration filename matches. No policies, grants or account/API credentials changed. Storage RLS remains enabled. The existing four storage policies are unchanged and scoped to the W9/project-file buckets, so none grants direct access to the photo bucket. App deployment remains a separate gate.

## Actual app upload test (2026-10-25)

At the owner's request, the actual local Next.js Podium app at `127.0.0.1:4181` was tested against hosted Podium Personnel database/storage, using only synthetic records and a generated solid-color image. This was not a deployed-app test. The local app used existing service configuration; email safe mode was on, the allowlist was empty, and no real email key was loaded. The synthetic organization has no members or email recipients, its musician is inactive with no email, and no services/positions were created.

Passed: browser upload through the real route; stored JPEG resized to 2000×1333 (16,018 bytes); EXIF removed; repeat upload leaves one object; survey submission succeeds despite a failed photo; saved answers survive reload; repeat submission returns 409; malformed upload returns 400; anonymous/public object reads return 400; unauthenticated admin-photo route returns 401; a service-client-issued signed URL returns 200 then 400 after expiry. No email logs were created for the fixture. The synthetic gig was then cancelled; its upload route returns 404.

Retained for review, not deleted: organization `d9bdf7e1-9603-4772-adb2-063ba4b8704f`, project `04e0687d-5347-4879-b059-8d600e71bb8d`, inactive musician `f4acecd7-5253-4a88-9826-9dcd950e1887`, report `c7543f93-a517-41ca-8e9d-f3765148216a`, and one private synthetic JPEG under that org/project/report prefix. Cleanup needs approval. Detailed receipt and screenshot are in local `.verification/hosted-upload-result.json` and `.verification/hosted-upload-success.png`.

Remaining verification limits: no authenticated admin-app session was created or reused, so authorized signed-URL issuance through the admin UI route remains untested end to end. The real signed-storage read used the existing service client; unit tests cover admin authorization. Physical iPhone/Safari and the deployed app remain untested. No new login/API credentials or access grants were created to bypass these limits.

Safeguards: the migration used a 5-second lock timeout and 30-second statement timeout; it did not rewrite or backfill rows. Preflight schema/constraint definitions and an aggregate data checksum were captured. A platform backup restore point was not independently verified (no backup inspection tool is available). The safe application rollback is to keep using the current app and leave the unused nullable columns in place. Do not drop columns or delete photos as an automatic rollback. A later destructive rollback requires separate approval and preservation of new answers.

## Existing environment

Read-only Supabase account discovery on 2026-10-25 confirmed:

- `Podium-Staging`, project `aswwahzkbomsdqxawvxo`, is **INACTIVE**.
- `Podium Personnel`, project `cyspguwdocseisjyjqmu`, is production and **ACTIVE_HEALTHY**. Only the expressly authorized isolated synthetic test above used this project; no customer records/photos were used.
- The existing connected account can list and inspect staging. This proves visibility, not that resume, migration, or deployment privileges have been granted. No credentials were retrieved or created. Staging was not resumed.

There is an existing staging target; no new project or account is needed. Resume and staging mutations are pending explicit approval. If existing deployment credentials cannot target staging, stop for the owner; do not create keys or change access grants.

## Exact proposed changes

For a separately approved staging test, apply the two migrations to **staging only**, before deploying this branch there. Both migrations are already applied to production:

1. Migration `20261025181007_concise_gig_report_and_photos.sql` adds nullable `gig_reports.details_accuracy` with CHECK values `matched`, `minor`, `significant`.
2. Add nullable `gig_reports.client_feedback` with CHECK values `positive`, `concern`, `none`.
3. Separate migration `20261025182131_private_gig_report_photos.sql` creates private bucket `gig-report-photos`, JPEG-only, 3,145,728-byte object limit. Existing bucket rows are left unchanged by the migration; explicitly verify an existing bucket is private and has the expected limits before proceeding.

No backfill, report-token changes, table grants, storage-object policies, auth settings, or personnel policies change. Existing report RLS remains. The bucket has no new anon/authenticated policies; uploads use the existing server service client only after resolving the report token. Read links require a logged-in owner/admin of the exact project's organization, expire after 300 seconds, and are returned with `private, no-store` caching. Raw HEIC/HEIF is not accepted. Files are decoded and rewritten to JPEG with metadata removed.

## Minimal approved run

1. Resume the existing staging project only after approval; confirm healthy status and project reference. Inspect schema/migration prerequisites and all existing `storage.objects` policies read-only. Stop if any broad policy would expose the new bucket.
2. Confirm the staging app uses staging credentials and outbound email is disabled by the existing safe-mode controls. Do not reuse production URLs, credentials, report tokens, or users' photos. If email suppression cannot be verified, do not submit a report.
3. Apply the migration. Verify both nullable columns/checks and the private bucket settings. Do not silently repair unrelated drift or broaden permissions.
4. Deploy the branch to an approved staging preview. Use synthetic fixtures: two organizations, existing authorized test owner/admin and non-admin sessions, one old report, and one unsubmitted report token. Create only synthetic staging rows after approval; create no new credentials/access grants.
5. On a physical iPhone/Safari, choose a normal Camera/Photos image and observe the returned file's MIME, size and actual signature locally. Test both Camera formats. Test a HEIC original chosen from Files, a JPEG exported via Preview, and a mixed batch. HEIC must receive clear per-file instructions; exported JPEG must upload. No conversion/upload is sent to a third-party service.
6. Submit the three required answers with all comments/client feedback blank; verify persisted values in staging and correct admin labels after reload. Check a legacy report still displays its original meanings. Repeat submit and verify one saved response with no duplicate notification.
7. Upload two JPEGs, interrupt one request, submit feedback while an upload fails, and retry that photo after submission. Verify saved objects stay associated with the gig, the retry does not duplicate an identical image, EXIF/GPS is absent, and admin access works after reload.
8. Verify anonymous access/public bucket URLs fail, non-admin and cross-organization access fail, and expired signed links fail. Check corrupt bytes, oversized uploads, unsupported image formats, and cancelled/unknown report tokens are rejected.
9. Record screenshots/results without real personal data. Remove only the synthetic test rows/photos created for this run if cleanup is approved. Leave production untouched.

## Local evidence and remaining limits

The local tests exercise the actual React preparation path in headless Edge with real JPEG/PNG/WebP and libheif's public HEIC example, plus corrupt/truncated and oversized fixtures. Unit API tests mock storage; the separate actual-app test above exercises hosted storage. The migration was also tested in embedded PostgreSQL. These checks do not verify physical iPhone picker transcoding, Safari codecs, iCloud downloads or camera capture.

Automatic HEIC conversion is not claimed: the installed Sharp build failed decoding the actual HEIC fixture because the HEVC codec is not built in. `heic-to` was investigated, but its documented conversion API does not expose a decoded-pixel budget; a bounded, device-tested decoder integration was not established. No HEIC dependency or broader upload acceptance was added. The fallback gives specific new-camera and existing-photo JPEG steps; unsupported files are not retried blindly.

References: [Apple camera formats](https://support.apple.com/en-us/116944), [Apple iPhone Preview export](https://support.apple.com/guide/iphone/export-or-compress-pdfs-and-images-iph61c20afe1/ios), [heic-to API](https://github.com/hoppergee/heic-to), [HEIC test fixture](https://github.com/strukturag/libheif/blob/master/examples/example.heic).
