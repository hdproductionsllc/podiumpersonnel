/**
 * Create Podium's three paid subscription tiers in Stripe — programmatically,
 * so nobody has to click around the dashboard.
 *
 * Creates (idempotently) three Products + one recurring monthly Price each:
 *   Ensemble  $29/mo   (lookup_key: podium_ensemble_monthly)
 *   Orchestra $79/mo   (lookup_key: podium_orchestra_monthly)
 *   Symphony  $199/mo  (lookup_key: podium_symphony_monthly)
 *
 * Idempotent: re-running finds the existing price by lookup_key instead of
 * creating a duplicate. Prints the price IDs to paste into Vercel env.
 *
 * The Stripe MODE (test vs live) is whatever your key is:
 *   sk_test_...  -> test products (safe, for building/verifying the flow)
 *   sk_live_...  -> LIVE products (real; harmless until a real checkout runs)
 *
 * Run:
 *   1. Put your key in .env.local:  STRIPE_SECRET_KEY=sk_test_...  (or sk_live_...)
 *   2. node scripts/create-stripe-tiers.js
 *
 * Products/prices existing in Stripe charge nothing on their own — money only
 * moves when a subscription is created. So creating them is a safe first step.
 */
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
if (!fs.existsSync(envPath)) {
  console.error('No .env.local found. Add STRIPE_SECRET_KEY=sk_test_... (or sk_live_...) and re-run.')
  process.exit(1)
}
const env = fs.readFileSync(envPath, 'utf8')
const keyMatch = env.match(/STRIPE_SECRET_KEY=(sk_(?:test|live)_[A-Za-z0-9]+)/)
if (!keyMatch) {
  console.error('STRIPE_SECRET_KEY not found in .env.local. Add STRIPE_SECRET_KEY=sk_test_... (or sk_live_...) and re-run.')
  process.exit(1)
}
const SECRET = keyMatch[1]
const MODE = SECRET.startsWith('sk_live_') ? 'LIVE' : 'TEST'

const Stripe = require('stripe')
const stripe = new Stripe(SECRET)

const TIERS = [
  { key: 'ensemble', name: 'Podium Ensemble', amount: 2900, lookup: 'podium_ensemble_monthly',
    description: 'Small groups & single ensembles — up to 60 performers, unlimited projects.' },
  { key: 'orchestra', name: 'Podium Orchestra', amount: 7900, lookup: 'podium_orchestra_monthly',
    description: 'Growing organizations — up to 250 performers, substitutions, priority support.' },
  { key: 'symphony', name: 'Podium Symphony', amount: 19900, lookup: 'podium_symphony_monthly',
    description: 'Institutions — unlimited performers & seats, multi-ensemble, dedicated onboarding.' },
]

async function ensureTier(t) {
  // Idempotency: a price with this lookup_key already exists?
  const existing = await stripe.prices.list({ lookup_keys: [t.lookup], active: true, limit: 1, expand: ['data.product'] })
  if (existing.data.length) {
    return { key: t.key, priceId: existing.data[0].id, productId: existing.data[0].product.id || existing.data[0].product, reused: true }
  }
  const product = await stripe.products.create({
    name: t.name,
    description: t.description,
    metadata: { podium_tier: t.key },
  })
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: t.amount,
    currency: 'usd',
    recurring: { interval: 'month' },
    lookup_key: t.lookup,
    metadata: { podium_tier: t.key },
  })
  return { key: t.key, priceId: price.id, productId: product.id, reused: false }
}

;(async () => {
  console.log(`\nStripe mode: ${MODE}  (key ${SECRET.slice(0, 12)}...)\n`)
  const results = []
  for (const t of TIERS) {
    const r = await ensureTier(t)
    console.log(`  ${r.reused ? 'reused ' : 'created'}  ${t.name.padEnd(18)} ${r.priceId}`)
    results.push(r)
  }
  const envVar = (k) => `STRIPE_${k.toUpperCase()}_PRICE_ID`
  console.log('\nAdd these to Vercel (podium-personnel → Production) and/or .env.local:\n')
  for (const r of results) console.log(`  ${envVar(r.key)}=${r.priceId}`)
  console.log(`\nMode was ${MODE}. ${MODE === 'TEST' ? 'Re-run with a live key when ready to charge real cards.' : 'These are LIVE — real subscriptions will bill.'}\n`)
})().catch((err) => {
  console.error('\nStripe error:', err.message)
  process.exit(1)
})
