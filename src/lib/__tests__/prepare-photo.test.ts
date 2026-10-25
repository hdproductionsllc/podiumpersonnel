import { afterEach, describe, expect, it, vi } from 'vitest'
import { HEIC_HELP, MAX_PHOTO_PIXELS, photoFormat, preparePhoto } from '@/lib/after-gig/prepare-photo'
import { MAX_SOURCE_BYTES } from '@/lib/after-gig/photos'

afterEach(() => vi.unstubAllGlobals())
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 0])

describe('mobile photo preparation', () => {
  it('recognizes byte signatures, including HEIF without a MIME label', () => {
    expect(photoFormat(jpeg)).toBe('jpeg')
    expect(photoFormat(new Uint8Array([137,80,78,71,13,10,26,10]))).toBe('png')
    expect(photoFormat(new TextEncoder().encode('RIFFxxxxWEBP'))).toBe('webp')
    expect(photoFormat(new TextEncoder().encode('xxxxftypheicxxxxmif1'))).toBe('heif')
    expect(photoFormat(new TextEncoder().encode('xxxxftypavifxxxxmif1'))).toBeNull()
    expect(photoFormat(new TextEncoder().encode('<svg/>'))).toBeNull()
  })
  it('rejects HEIC before decoding or networking with actionable iPhone instructions', async () => {
    const decode = vi.fn()
    vi.stubGlobal('createImageBitmap', decode)
    await expect(preparePhoto(new File(['xxxxftypheicxxxxmif1'], 'photo.jpg', { type: 'image/jpeg' }))).rejects.toThrow(HEIC_HELP)
    expect(decode).not.toHaveBeenCalled()
  })
  it('explains truncated HEIF identified by name or MIME', async () => {
    await expect(preparePhoto(new File(['broken'], 'photo.HEIC'))).rejects.toThrow(HEIC_HELP)
    await expect(preparePhoto(new File(['broken'], 'photo', { type: 'image/heif' }))).rejects.toThrow(HEIC_HELP)
  })
  it('bounds source bytes before decoding', async () => {
    const decode = vi.fn()
    vi.stubGlobal('createImageBitmap', decode)
    await expect(preparePhoto(new File([new Uint8Array(MAX_SOURCE_BYTES + 1)], 'large.jpg'))).rejects.toThrow('20 MB')
    expect(decode).not.toHaveBeenCalled()
  })
  it('handles corrupt JPEG bytes as a nonretryable preparation error', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')))
    await expect(preparePhoto(new File([jpeg], 'photo.jpg'))).rejects.toThrow('could not be read')
  })
  it('closes over-limit bitmaps before allocating a canvas', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: MAX_PHOTO_PIXELS + 1, height: 1, close }))
    await expect(preparePhoto(new File([jpeg], 'photo.jpg'))).rejects.toThrow('40 megapixels')
    expect(close).toHaveBeenCalled()
  })
  it('uses JPEG bytes even if a converted photo keeps its HEIC name and empty MIME', async () => {
    const close = vi.fn()
    const decode = vi.fn().mockResolvedValue({ width: 4000, height: 3000, close })
    const canvas = { width: 0, height: 0, getContext: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }), toBlob: (callback: (blob: Blob) => void) => callback(new Blob([jpeg], { type: 'image/jpeg' })) }
    vi.stubGlobal('createImageBitmap', decode)
    vi.stubGlobal('document', { createElement: () => canvas })
    const output = await preparePhoto(new File([jpeg], 'photo.HEIC'))
    expect(decode.mock.calls[0][0].type).toBe('image/jpeg')
    expect(output.type).toBe('image/jpeg')
    expect([canvas.width, canvas.height]).toEqual([2000, 1500])
    expect(close).toHaveBeenCalled()
  })
})
