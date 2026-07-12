/**
 * Configure the Stripe Customer Portal so the app's "Manage Subscription"
 * button works — plan switching among the three tiers, cancellation, payment
 * method updates, invoice history. Idempotent-ish: creates a configuration
 * (the first one becomes the account default, which the portal route uses).
 *
 * Run: node scripts/configure-stripe-portal.js
 */
const fs = require('fs')
const path = require('path')

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const key = env.match(/STRIPE_SECRET_KEY\s*=\s*["']?(sk_(?:test|live)_[A-Za-z0-9]+)/)?.[1]
const priceIds = ['STRIPE_ENSEMBLE_PRICE_ID', 'STRIPE_ORCHESTRA_PRICE_ID', 'STRIPE_SYMPHONY_PRICE_ID']
  .map((k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim())
if (!key || priceIds.some((p) => !p)) {
  console.error('Missing STRIPE_SECRET_KEY or a price id in .env.local')
  process.exit(1)
}
const stripe = require('stripe')(key)

;(async () => {
  // Resolve each price -> its product.
  const products = []
  for (const priceId of priceIds) {
    const price = await stripe.prices.retrieve(priceId)
    products.push({ product: price.product, prices: [priceId] })
  }

  const existing = await stripe.billingPortal.configurations.list({ limit: 10 })
  const current = existing.data.find((c) => c.is_default) || existing.data[0]

  const params = {
    business_profile: { headline: 'Manage your Podium subscription' },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        proration_behavior: 'create_prorations',
        products,
      },
    },
  }

  const config = current
    ? await stripe.billingPortal.configurations.update(current.id, params)
    : await stripe.billingPortal.configurations.create(params)

  console.log(`${current ? 'Updated' : 'Created'} portal configuration ${config.id} (default: ${config.is_default})`)
  console.log('  plan switching among:', products.map((p) => p.prices[0]).join(', '))
  console.log('  cancel at period end: on | payment method update: on | invoice history: on')
})().catch((e) => { console.error('Stripe error:', e.message); process.exit(1) })
