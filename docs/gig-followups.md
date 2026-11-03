# Gig follow-ups and venue pictures

Open a project's **Gig Details Status**, then **Send follow-up or updated details**.
Write a subject and message, optionally choose up to three PNG/JPEG/WebP pictures,
review every recipient, then send. Images are limited to 750 KiB each and 1.5 MiB
combined. They are decoded, checked against their declared format, stripped of
metadata, scaled down if needed and re-encoded as static PNGs. An unusually detailed
image may need reducing before uploading.

**Ordinary follow-up** preserves the existing gig-details confirmation round.
**Material details changed** creates a new round, retaining the previous send and
confirmations. Update the project schedule/venue first when appropriate, and describe
all changes in the message. The message does not edit project fields. The recipient's
confirmation page shows the notes and updates as well as the gig summary.

Every sent musician message produces the existing marked owner/admin copy, now
including its attachments. Personal confirmation links in those copies remain
disabled. When a musician confirms, the existing confirmation handler notifies
owners/admins once, including the all-confirmed notice when appropriate. A repeat
confirmation click does not send that notification again.

## Architecture and access

UI → authenticated project follow-ups API → atomic `prepare_gig_followup` RPC →
durable outbox → existing `notify`/Resend email path → per-recipient status.

`gig_followups` stores immutable message and normalized image snapshots;
`gig_followup_recipients` stores the reviewed roster and delivery results. Both tables
have RLS enabled and no anonymous/authenticated Data API access. Only the existing
backend service role can access them. The SECURITY INVOKER RPC is executable only
by that role and independently validates admin membership, project ownership and
the live confirmed roster. Missing emails and a changed roster block sending.

Images are MIME attachments, not public links. The history's download endpoint
requires an authenticated owner/admin of the same project organization and returns
private, no-store downloads. No storage bucket, public URL, credentials or new
environment variables are required. Stored image bytes are retained with the message
and cascade when its project is deleted. Keep this small-volume facility for venue
maps; larger document libraries should continue using the existing file system.

## Duplicate and uncertain delivery handling

The client disables repeat submission and uses a stable request ID. The database
serializes preparation per project, checks the reviewed roster, deduplicates identical
content for ten minutes (indefinitely while an equivalent delivery is uncertain),
and atomically creates any new confirmation round. A compare-and-set claim allows
only one dispatcher per batch. Individual emails and owner copies also use stable
Resend idempotency keys. The provider's 24-hour idempotency window is not relied on
for permanent duplicate protection.

No automatic resend is attempted after a provider timeout or process crash. History
shows **delivery uncertain**, **sending — delivery not yet verified**, or **not started**
instead of reporting success. A batch still in progress blocks another batch for that
project. Support must reconcile provider records before any recovery; do not reset a
claim and resend blindly. A successful status means accepted by the email provider,
not read or delivered to the inbox. Existing email audit logs continue to record sends
and failures; history carries the stronger uncertainty warning.

## Deployment and tests

Apply `20261103045346_gig_followups_private_attachments.sql` before the application.
It adds two tables and one function; no existing gig records are rewritten.
The migration was applied to Podium Personnel on November 3, 2026 and access grants
were verified. An application rollback can leave these additive tables in place.

Run unit tests with a dummy RESEND_API_KEY and no live credentials. On Windows,
the existing suite also needs Git's `usr/bin` on PATH for its grep-based checks.
`scripts/test-gig-followup-migration.mjs` runs the actual migration against a synthetic
in-memory PostgreSQL (PGlite 0.5.14), checking authorization, duplicate requests,
fresh versus preserved confirmations, roster changes, and private-table permissions.
It accepts the absolute path to the isolated PGlite `dist/index.js`; it never connects
to the production database or sends email.
