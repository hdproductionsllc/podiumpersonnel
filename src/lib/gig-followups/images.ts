import sharp from 'sharp'
import { MAX_IMAGE_BYTES, MAX_TOTAL_BYTES, type ImageAttachment } from './validation'

/** Decode and re-encode real raster images, stripping metadata and active/trailing content. */
export async function normalizeImages(images: ImageAttachment[]): Promise<ImageAttachment[]> {
  let total = 0
  const result: ImageAttachment[] = []
  for (const image of images) {
    const bytes = Buffer.from(image.content, 'base64')
    total += bytes.length
    if (bytes.length > MAX_IMAGE_BYTES || total > MAX_TOTAL_BYTES) throw new Error('Images exceed the size limit')
    const decoder = sharp(bytes, { limitInputPixels: 16000000, failOn: 'warning', animated: false })
    const metadata = await decoder.metadata()
    const expected = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' }[image.contentType]
    if (metadata.format !== expected || (metadata.pages ?? 1) > 1) throw new Error('Use a static PNG, JPEG or WebP image')
    const content = await decoder.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
    if (content.length > MAX_IMAGE_BYTES) throw new Error('Image is too detailed; use a smaller image')
    const stem = image.filename.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9 _-]/g, '_').slice(0,80) || 'venue-map'
    result.push({ filename: `${stem}.png`, contentType: 'image/png', content: content.toString('base64') })
  }
  if (result.reduce((n, image) => n + Buffer.byteLength(image.content, 'base64'), 0) > MAX_TOTAL_BYTES) throw new Error('Images exceed the size limit')
  return result
}
