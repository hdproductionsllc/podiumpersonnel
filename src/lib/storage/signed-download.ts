/**
 * Signed Supabase Storage download links that keep the whole filename.
 *
 * `createSignedUrl(path, ttl, { download: name })` appends the name with
 * encodeURI, which leaves `&`, `#`, `+` and `=` alone. A project called
 * "Madelyn Intagliata Violin & Cello Duo" therefore produced
 * `…&download=Madelyn%20Intagliata%20Violin%20&%20Cello…` — the query string
 * split at the ampersand and the browser saved "Madelyn Intagliata Violin " with
 * no extension. Real, 2026-09-21.
 *
 * So the link is signed WITHOUT the download option and the filename is added
 * here with encodeURIComponent, which the storage server decodes correctly:
 * Content-Disposition then carries the full name, extension included.
 */

/** The slice of a Supabase storage bucket handle this helper needs. */
export interface SignableBucket {
  createSignedUrl(
    path: string,
    expiresIn: number
  ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>
}

/** Append a download filename to an already-signed storage URL, fully encoded. */
export function withDownloadName(signedUrl: string, fileName: string): string {
  const sep = signedUrl.includes('?') ? '&' : '?'
  return `${signedUrl}${sep}download=${encodeURIComponent(fileName)}`
}

/**
 * Sign a storage object for download under `fileName`. Returns the URL, or
 * null with the storage error when signing failed.
 */
export async function createSignedDownloadUrl(
  bucket: SignableBucket,
  storagePath: string,
  fileName: string,
  expiresIn = 3600
): Promise<{ url: string | null; error: { message: string } | null }> {
  const { data, error } = await bucket.createSignedUrl(storagePath, expiresIn)
  if (error || !data) return { url: null, error: error ?? { message: 'No signed URL returned' } }
  return { url: withDownloadName(data.signedUrl, fileName), error: null }
}
