import { z } from 'zod'

export const MAX_IMAGE_BYTES = 750 * 1024
export const MAX_TOTAL_BYTES = 1500 * 1024
export const MAX_REQUEST_BYTES = 2200 * 1024
export const followupSchema = z.object({
  requestId: z.string().uuid(),
  mode: z.enum(['followup', 'material_update']),
  subject: z.string().trim().min(1).max(120).regex(/^[^\r\n]+$/),
  message: z.string().trim().min(1).max(10000),
  recipientIds: z.array(z.string().uuid()).min(1).max(50),
  attachments: z.array(z.object({
    filename: z.string().min(1).max(100),
    contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    content: z.string().min(4).max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  }).strict()).max(3),
}).strict()

export type FollowupInput = z.infer<typeof followupSchema>
export type ImageAttachment = FollowupInput['attachments'][number]

// Bound chunked bodies too; Content-Length alone is not a security boundary.
export async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Use JSON')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Empty request')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new Error('Message is too large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
