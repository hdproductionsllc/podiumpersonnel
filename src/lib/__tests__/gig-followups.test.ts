import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { followupSchema, readBoundedJson, MAX_REQUEST_BYTES } from '@/lib/gig-followups/validation'
import { normalizeImages } from '@/lib/gig-followups/images'
import { renderFollowup } from '@/lib/gig-followups/render'

const valid = { requestId: '12345678-1234-4234-8234-123456789012', mode: 'followup', subject: 'Parking', message: 'Use the north gate.', recipientIds: ['12345678-1234-4234-8234-123456789013'], attachments: [] }
describe('follow-up validation', () => {
  it('requires explicit mode, nonempty content and bounded reviewed roster', () => {
    expect(followupSchema.safeParse(valid).success).toBe(true)
    for (const change of [{ mode: 'reset' }, { subject: 'a\r\nBcc: bad' }, { message: ' ' }, { recipientIds: [] }, { attachments: Array(4).fill({ filename: 'x', content: 'AAAA', contentType: 'image/png' }) }]) {
      expect(followupSchema.safeParse({ ...valid, ...change }).success).toBe(false)
    }
  })
  it('bounds streamed bodies without trusting Content-Length', async () => {
    const request = new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(MAX_REQUEST_BYTES + 1) })
    await expect(readBoundedJson(request)).rejects.toThrow('too large')
    await expect(readBoundedJson(new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid) }))).resolves.toEqual(valid)
  })
  it('rejects SVG, forged MIME and corrupt image bytes', async () => {
    await expect(normalizeImages([{ filename: 'map.png', contentType: 'image/png', content: Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64') }])).rejects.toThrow()
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).jpeg().toBuffer()
    await expect(normalizeImages([{ filename: 'map.png', contentType: 'image/png', content: jpeg.toString('base64') }])).rejects.toThrow()
    await expect(normalizeImages([{ filename: 'map.png', contentType: 'image/png', content: 'AAAA' }])).rejects.toThrow()
  })
  it('re-encodes safe images and strips metadata/trailing content and path characters', async () => {
    const original = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } }).withMetadata().png().toBuffer()
    const [image] = await normalizeImages([{ filename: '../../map<script>.png', contentType: 'image/png', content: Buffer.concat([original,Buffer.from('<script>bad</script>')]).toString('base64') }])
    const bytes = Buffer.from(image.content,'base64')
    expect(image.filename).not.toMatch(/[<>/\\]/)
    expect(bytes.includes(Buffer.from('<script>'))).toBe(false)
    const metadata = await sharp(bytes).metadata()
    expect(metadata.format).toBe('png'); expect(metadata.exif).toBeUndefined()
  })
  it('rejects oversized input and decoded pixel bombs', async () => {
    await expect(normalizeImages([{ filename: 'x.png', contentType: 'image/png', content: Buffer.alloc(800*1024).toString('base64') }])).rejects.toThrow()
    const huge = await sharp({ create: { width: 4100, height: 4100, channels: 3, background: 'white' } }).png().toBuffer()
    await expect(normalizeImages([{ filename: 'x.png', contentType: 'image/png', content: huge.toString('base64') }])).rejects.toThrow()
  })
})
describe('follow-up email content', () => {
  it('escapes all user text and adds no confirmation to ordinary follow-ups', () => {
    const result = renderFollowup({ organizationName: 'A & B', projectName: '<img>', message: '<script>bad</script>\nNorth gate', filenames: ['<map>.png'] })
    expect(result.html).not.toContain('<script>'); expect(result.html).not.toContain('<img>')
    expect(result.html).toContain('&lt;map&gt;'); expect(result.html).not.toContain('href=')
    expect(result.text).toContain('confirmation is unchanged')
  })
  it('includes a fresh confirmation only for an explicit update', () => {
    const result = renderFollowup({ organizationName: 'Org', projectName: 'Gig', message: 'New call time', filenames: ['map.png'], confirmationUrl: 'https://example.test/confirm-details/token' })
    expect(result.html).toContain('confirm this update'); expect(result.text).toContain('Attached: map.png')
  })
})
