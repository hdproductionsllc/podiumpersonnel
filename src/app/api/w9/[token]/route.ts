import { NextResponse } from 'next/server'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { getAppUrl } from '@/lib/utils'

/**
 * Tokenized W-9 submission. Public by design — the musician has no account, and
 * the token in their request email is the credential.
 *
 * Runs on the service role because there is no session to scope with, so every
 * check below is the real authorization: the token must exist, must not have
 * expired, and the file must pass type and size limits before anything is
 * written. The token identifies exactly one musician (unique index), so there is
 * no id in the request body a caller could tamper with.
 */

const MAX_BYTES = 5 * 1024 * 1024 // matches the w9-documents bucket limit
const ALLOWED = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
} as const

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  try {
    const supabase = createServiceClient()

    const { data: musician, error: lookupError } = await supabase
      .from('musicians')
      .select('id, first_name, last_name, organization_id, w9_request_expires_at, w9_file_url')
      .eq('w9_request_token', token)
      .maybeSingle()

    if (lookupError || !musician) {
      return NextResponse.json({ error: 'This upload link is not valid.' }, { status: 404 })
    }

    if (musician.w9_request_expires_at && new Date(musician.w9_request_expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This upload link has expired. Ask the organization to send a new one.' },
        { status: 410 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Please choose a file to upload.' }, { status: 400 })
    }

    const extension = ALLOWED[file.type as keyof typeof ALLOWED]
    if (!extension) {
      return NextResponse.json(
        { error: 'Please upload a PDF, JPG, or PNG file.' },
        { status: 400 }
      )
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'That file appears to be empty.' }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'That file is larger than 5MB.' }, { status: 400 })
    }

    // Server-generated path, scoped to the org. The client never influences it,
    // so there is no traversal or cross-org write to worry about. A fresh UUID
    // each time means a re-upload cannot collide with, or silently overwrite,
    // the previous submission.
    const storagePath = `${musician.organization_id}/${musician.id}/${crypto.randomUUID()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from('w9-documents')
      .upload(storagePath, file, { contentType: file.type, upsert: false })

    if (uploadError) {
      console.error(`W-9 upload failed for musician ${musician.id}:`, uploadError)
      return NextResponse.json(
        { error: 'We could not save that file. Please try again.' },
        { status: 500 }
      )
    }

    const previousPath = musician.w9_file_url

    // Point the record at the new file and burn the token — the link is for one
    // successful submission. Re-uploading a correction needs a fresh request,
    // which the contractor can send in one click.
    const { error: updateError } = await supabase
      .from('musicians')
      .update({
        w9_on_file: true,
        w9_file_url: storagePath,
        w9_uploaded_at: new Date().toISOString(),
        // A newly submitted form has not been checked by a human yet.
        w9_verified_at: null,
        w9_verified_by: null,
        w9_request_token: null,
        w9_request_expires_at: null,
      })
      .eq('id', musician.id)

    if (updateError) {
      // The row still points at the old file, so clean up the orphan rather than
      // leaving an unreferenced document in the bucket.
      await supabase.storage.from('w9-documents').remove([storagePath])
      console.error(`W-9 record update failed for musician ${musician.id}:`, updateError)
      return NextResponse.json(
        { error: 'We could not save that file. Please try again.' },
        { status: 500 }
      )
    }

    // Only once the record is safely repointed is the old file redundant.
    if (previousPath && previousPath !== storagePath) {
      await supabase.storage
        .from('w9-documents')
        .remove([previousPath])
        .catch((err) => console.warn('Failed to remove superseded W-9:', err))
    }

    notifyAdmins(supabase, musician).catch((err) =>
      console.warn('Failed to notify admins of W-9 upload:', err)
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(`Unexpected error handling W-9 upload for token ${token}:`, error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}

/** Tell the org their W-9 arrived. Best-effort — never fails the upload. */
async function notifyAdmins(
  supabase: ReturnType<typeof createServiceClient>,
  musician: { id: string; first_name: string; last_name: string; organization_id: string }
) {
  const adminEmails = await getOrgAdminEmails(musician.organization_id)
  if (adminEmails.length === 0) return

  const name = `${musician.first_name} ${musician.last_name}`.trim()
  const dashboardUrl = `${getAppUrl()}/dashboard/musicians`

  const result = await sendEmail({
    to: adminEmails,
    subject: `W-9 received from ${name}`,
    html:
      `<p><strong>${name}</strong> has submitted their W-9.</p>` +
      `<p>It is on file and ready to review in your ` +
      `<a href="${dashboardUrl}">Musicians dashboard</a>.</p>`,
  })

  if (result?.id) {
    await logEmail({
      organizationId: musician.organization_id,
      recipientEmail: adminEmails.join(', '),
      recipientName: 'Organization admins',
      subject: `W-9 received from ${name}`,
      emailType: 'w9_received',
      musicianId: musician.id,
      resendEmailId: result.id,
    })
  }
}
