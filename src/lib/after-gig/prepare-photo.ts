import { MAX_SOURCE_BYTES, MAX_PHOTO_BYTES } from './photos'

export const MAX_PHOTO_PIXELS = 40_000_000
export const HEIC_HELP = 'This HEIC/HEIF photo was not uploaded. On iOS 26 or later, save it to Files, open it in Preview, tap the menu beside its filename, then Export, JPEG, Done and Save. Choose that saved JPEG here. For a new photo, use Settings > Camera > Formats > Most Compatible before taking it. You can also send your report without photos.'

// Inspect bytes, not an untrusted MIME label or filename. An iOS picker can
// return a converted JPEG while retaining the original name or an empty type.
export function photoFormat(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | 'heif' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'png'
  const text = new TextDecoder('ascii').decode(bytes)
  if (text.slice(0, 4) === 'RIFF' && text.slice(8, 12) === 'WEBP') return 'webp'
  if (text.slice(4, 8) === 'ftyp') {
    const brands = [text.slice(8, 12)]
    for (let i = 16; i + 4 <= bytes.length; i += 4) brands.push(text.slice(i, i + 4))
    if (brands.some(brand => ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) && !brands.some(brand => ['avif', 'avis'].includes(brand))) return 'heif'
  }
  return null
}

export async function preparePhoto(file: File): Promise<Blob> {
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error('Choose a photo up to 20 MB. Your report can be sent without photos.')
  const format = photoFormat(new Uint8Array(await file.slice(0, 64).arrayBuffer()))
  if (format === 'heif' || (!format && (/\.hei[cf]$/i.test(file.name) || /^image\/hei[cf]/i.test(file.type)))) throw new Error(HEIC_HELP)
  if (!format) throw new Error('Choose a JPEG, PNG or WebP photo. This file is not a supported image.')
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file.slice(0, file.size, `image/${format}`)) }
  catch { throw new Error('This photo could not be read. Choose another JPEG, PNG or WebP, or take a new JPEG photo.') }
  try {
    if (bitmap.width * bitmap.height > MAX_PHOTO_PIXELS) throw new Error('This photo is over 40 megapixels. Choose a smaller copy or take a standard-resolution photo.')
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare this photo. Try another browser.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not prepare this photo.')), 'image/jpeg', 0.85))
    if (blob.size > MAX_PHOTO_BYTES) throw new Error('This photo is too large. Try a smaller image.')
    return blob
  } finally { bitmap.close() }
}
