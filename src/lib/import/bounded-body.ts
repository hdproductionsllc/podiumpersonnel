export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export async function boundedImportForm(request: Request): Promise<FormData> {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Missing file')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_IMPORT_BYTES + 65536) {
      await reader.cancel()
      throw new Error('Import must be 5 MB or smaller')
    }
    chunks.push(value)
  }
  return new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData()
}
