import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { resolveGigReportToken } from '@/lib/after-gig/report-token'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { PHOTO_BUCKET, MAX_PHOTO_BYTES, PHOTO_TYPES, photoPrefix } from '@/lib/after-gig/photos'

export const runtime = 'nodejs'
const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const report = await resolveGigReportToken(token)
  if (!report) return fail('Not found', 404)
  const limit = rateLimit(`report-photo:${report.reportId}`, 30, 10 * 60 * 1000)
  if (!limit.allowed) return fail('Too many uploads. Please wait a few minutes.', 429)
  // Bound the complete multipart body, even when Content-Length is absent or false.
  const reader = request.body?.getReader()
  if (!reader) return fail('Choose a photo.', 400)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_PHOTO_BYTES + 65536) {
        await reader.cancel()
        return fail('Photo is too large. Try a smaller image.', 413)
      }
      chunks.push(value)
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData()
    const file = form.get('photo')
    if (!(file instanceof File) || !PHOTO_TYPES.includes(file.type) || file.size === 0 || file.size > MAX_PHOTO_BYTES) {
      return fail('Choose a JPEG, PNG or WebP photo up to 3 MB.', 400)
    }
    let bytes: Buffer
    try {
      // Decode and re-encode to validate the actual image and strip EXIF/GPS metadata.
      const input = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000, failOn: 'warning' })
      const metadata = await input.metadata()
      if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) return fail('Choose a still JPEG, PNG or WebP photo.', 400)
      bytes = await input.rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
    } catch { return fail('This image could not be read. Try another photo.', 400) }
    if (bytes.length > MAX_PHOTO_BYTES) return fail('Photo is too large. Try a smaller image.', 413)
    const bucket = createServiceClient().storage.from(PHOTO_BUCKET)
    const prefix = photoPrefix(report)
    const name = `${createHash('sha256').update(bytes).digest('hex')}.jpg`
    const { data: existing, error: listError } = await bucket.list(prefix, { limit: 100 })
    if (listError) return fail('Photos are unavailable. Your report can still be sent. Try photos again later.', 503)
    if (existing?.some((item) => item.name === name)) return NextResponse.json({ success: true })
    const { error } = await bucket.upload(`${prefix}/${name}`, bytes, { contentType: 'image/jpeg', upsert: false })
    // A concurrent retry of the same image is a successful no-op.
    if (error && error.message !== 'The resource already exists' && error.statusCode !== '409') return fail('Photo was not saved. Please retry. Your report can still be sent.', 503)
    return NextResponse.json({ success: true })
  } catch { return fail('Could not upload this photo. Please retry. Your report can still be sent.', 500) }
}
