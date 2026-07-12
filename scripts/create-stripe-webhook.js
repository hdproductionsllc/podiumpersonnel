/**
 * Create Podium's Stripe webhook endpoint (live app) and capture its signing
 * secret — via the API, so nobody has to click the dashboard.
 *
 * Idempotent: if an endpoint for the same URL already exists, it does NOT
 * create a duplicate. (Stripe only returns the signing secret at creation time,
 * so if one already exists you must roll its secret in the dashboard or delete
 * it and re-run — this script will tell you.)
 *
 * Run:  node scripts/create-stripe-webhook.js
 * Then: the printed STRIPE_WEBHOOK_SECRET is appended to .env.local.
 */
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
const env = fs.readFileSync(envPath, 'utf8')
const key = env.match(/STRIPE_SECRET_KEY\s*=\s*["']?(sk_(?:test|live)_[A-Za-z0-9]+)/)?.[1]
if (!key) { console.error('STRIPE_SECRET_KEY not found in .env.local'); process.exit(1) }

const stripe = require('stripe')(key)
const URL = 'https://app.podiumpersonnel.com/api/billing/webhook'
const EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]

;(async () => {
  const existing = await stripe.webhookEndpoints.list({ limit: 100 })
  const dupe = existing.data.find((e) => e.url === URL)
  if (dupe) {
    console.log(`A webhook for ${URL} already exists (id ${dupe.id}).`)
    console.log('Its signing secret is only shown at creation. To get a fresh one:')
    console.log('  - delete it in the Stripe dashboard and re-run this script, or')
    console.log('  - roll the secret there and paste it into .env.local as STRIPE_WEBHOOK_SECRET.')
    return
  }
  const wh = await stripe.webhookEndpoints.create({
    url: URL,
    enabled_events: EVENTS,
    description: 'Podium billing webhook',
  })
  console.log(`Created webhook ${wh.id} -> ${URL}`)
  console.log(`Events: ${EVENTS.join(', ')}`)
  // Append the secret to .env.local (replace any existing line first)
  let contents = fs.readFileSync(envPath, 'utf8').replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, '').replace(/\n{3,}/g, '\n\n')
  contents = contents.trimEnd() + `\nSTRIPE_WEBHOOK_SECRET=${wh.secret}\n`
  fs.writeFileSync(envPath, contents)
  console.log(`\nSTRIPE_WEBHOOK_SECRET written to .env.local (${wh.secret.slice(0, 10)}...).`)
})().catch((e) => { console.error('Stripe error:', e.message); process.exit(1) })
