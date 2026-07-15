/**
 * Set the CORS policy on the repertoire R2 bucket so the app can upload
 * part PDFs browser-direct via presigned PUT URLs (bytes never touch a
 * serverless route — the 4.5MB Vercel body cap lesson).
 *
 * Idempotent: PutBucketCors replaces the whole policy every run.
 *
 * Usage:  node scripts/r2-set-cors.js          # apply
 *         node scripts/r2-set-cors.js --show   # print current policy only
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// Load .env.local (same convention as the other repertoire scripts).
const envFile = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}

const { AwsClient } = require('aws4fetch')

const ACCOUNT = process.env.R2_ACCOUNT_ID
const KEY = process.env.R2_ACCESS_KEY_ID
const SECRET = process.env.R2_SECRET_ACCESS_KEY
const BUCKET = process.env.R2_BUCKET || 'podium-repertoire'
if (!ACCOUNT || !KEY || !SECRET) {
  console.error('Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY in .env.local')
  process.exit(1)
}

const ORIGINS = [
  'https://app.podiumpersonnel.com',
  'https://*.vercel.app', // preview deploys
  'http://localhost:3000', // local dev
]

const CORS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration>
  <CORSRule>
${ORIGINS.map((o) => `    <AllowedOrigin>${o}</AllowedOrigin>`).join('\n')}
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`

async function main() {
  const aws = new AwsClient({ accessKeyId: KEY, secretAccessKey: SECRET, service: 's3', region: 'auto' })
  const url = `https://${ACCOUNT}.r2.cloudflarestorage.com/${encodeURIComponent(BUCKET)}?cors`

  if (!process.argv.includes('--show')) {
    const md5 = crypto.createHash('md5').update(CORS_XML).digest('base64')
    const put = await aws.fetch(url, {
      method: 'PUT',
      body: CORS_XML,
      headers: { 'content-md5': md5, 'content-type': 'application/xml' },
    })
    if (!put.ok) {
      console.error(`PutBucketCors failed: ${put.status} ${put.statusText}\n${await put.text()}`)
      process.exit(1)
    }
    console.log(`CORS policy applied to bucket "${BUCKET}".`)
  }

  const get = await aws.fetch(url, { method: 'GET' })
  console.log(`Current policy (${get.status}):\n${await get.text()}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
