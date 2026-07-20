# Podium Launch-Readiness Brief

**Written:** 2026-07-17 · **For:** the fresh Claude Code session opening in `C:\Users\david\Documents\Podium`
**Master plan:** `C:\Users\david\tasks\todo.md` (approved 90-day beachhead plan — Phases 0–1 are your scope) and `C:\Users\david\tasks\plan-detailed.md` (the expanded execution version: week-by-week calendar, mini-specs, verification depth).
**Grounding audit:** `C:\Users\david\tasks\audits\podium-audit-2026-07-17.md`.

This brief is self-contained. Every file path and line number below was spot-checked against the live repo on 2026-07-17. Where the audit was wrong, it is corrected inline and flagged **[AUDIT CORRECTION]**.

---

## 1. Mission & context

**The beachhead.** Podium is launching to **wedding / event string ensembles** (quartets, trios, duos) with a **founding cohort of 15**. The strategy is a viral sub-call loop: when a booked musician can't make a gig, the contractor sends a substitute a one-tap tokenless accept link (`/gig/{token}`). That link — and every transactional email footer — becomes a distribution surface. A forwarded sub-call is how a musician first meets Podium; a "claim your free account" prompt and a "Powered by Podium — run your ensemble free" footer turn that touch into a signup. Positioning: **"built by the leader of four working quartets"** (David runs four quartets across four states; they become the dogfooded case study).

**Why this is a thin build, not a platform build.** The hard plumbing is already done and verified: a free musician portal (`src/app/musician/*`), tokenless one-tap accept with atomic chair transfer, robust roster import (xlsx/csv/vcf), four Stripe tiers with idempotent webhooks, ~26 branded email templates, and a ~180+ test vitest suite. May's five ship-blockers are all closed. What's missing is a thin **activation / viral layer** plus small **commercial toggles**.

**Your three jobs:**
1. **Build the loop layer** — the B-queue in §2 (musician self-signup, footer CTA sweep, founding-member coupon, waitlist, activation nudges, demo seed, marketing framing).
2. **Harden** — close the remaining ship-review items, add tests for every B-item, keep the suite green.
3. **Verify** — the double/triple-check protocol in §3, recorded in a `VERIFICATION-LOG.md`.

**Guardrails up front:** no new features beyond the B-queue. Never touch prod data or live Stripe. Every change tested. Respect `tasks/lessons.md`. If a B-item exposes a deeper problem, **STOP and write it up** — do not improvise a redesign; scope changes are David's call.

---

## 2. Build queue (ordered, with mini-specs)

Order is dependency-driven: **B1 → B2 → B3** are the loop core (B2 is nearly done but blocked by B1). **B4 → B5** are the commercial levers. **B6 → B7 → B8** are activation/polish. **B9 → B10** are marketing.

### Conventions you must follow (from `tasks/lessons.md` — verified)
- **Musicians are NOT org members.** They live in the `musicians` table, never `organization_members`. Any `/api/musician/*` route or any route reading org-owned tables on a musician's behalf **must use `createServiceClient()`** (RLS bypass). The public gig routes already do this correctly (`src/app/gig/[token]/page.tsx:14`, `.../accept/route.ts:24`).
- **`.insert()` does not throw on RLS failure** — always check the `error` return; never swallow with empty `catch {}`.
- **Resend rate limit:** in ANY email-send loop, `if (i > 0) await new Promise(r => setTimeout(r, 600))`. Increment `sentCount` immediately after send; wrap `logEmail()` in its own try/catch.
- **"Fixed" means deployed.** For status reporting, "written locally" ≠ "fixed." You will NOT be deploying (that's David) — so report items as "written + tested locally, ready for David to deploy."
- Server error responses use `serverError(context, error)` from `src/lib/api-helpers.ts:20` (logs real error, returns generic message). New endpoints: gate with `requireOrgAdmin()` / `requireAuth()` (`api-helpers.ts:28,39`).

---

### B1 — Open musician self-signup  *(loop-critical, size M)*

**Goal:** Let a musician create a portal account **without** already being on an org roster, and link their account to `musicians` rows on the first offer/roster match.

**Current state (verified):** The register form is at **`src/components/musician/auth/register-form.tsx`** (the audit's path `src/app/musician/register/register-form.tsx` is wrong — the page at `src/app/musician/register/page.tsx:1-9` just renders `<MusicianRegisterForm/>`). **[AUDIT CORRECTION]**
- The roster-match block is at **`register-form.tsx:55-72`**: it queries the `musicians` table (browser/anon client, lines 56-60) and hard-blocks with "No musician records found for this email…" at **lines 68-72** when there's no match.
- On success it already calls the RPC **`link_musician_records_to_user(p_user_id, p_email)`** at **lines 89-95** — this is the existing linking primitive (matches `musicians` rows by email, stamps `user_id`).

**The musicians-table vs organization_members duality (from lessons.md):** A "musician account" is a Supabase auth user whose email matches one or more `musicians.email` rows; linkage = `musicians.user_id` set. There is nothing to link at signup time for a brand-new musician not yet on any roster — so linking must **also** fire later, when a `musicians` row bearing their email is created (roster import / manual add) or when an offer is sent to that email.

**Approach:**
1. **Remove the hard block** at `register-form.tsx:68-72`. Allow signup for any valid email.
2. **Move the signup + link logic server-side** into a new `POST /api/musician/register` route using `createServiceClient()` (per lessons: the current client-side `musicians` read uses the anon key and is fragile — the service client is correct for musician-table reads). The route: create the auth user, then call `link_musician_records_to_user`. Keep the Google OAuth path working (it flows through `/musician/auth/callback`).
3. **Link-on-first-match, the deeper half:** when a `musicians` row is created or an offer is sent to an email that matches an existing musician auth user, stamp `user_id`. Cleanest seam: re-run the link RPC (keyed by email) at the point a `musicians` row is inserted with an email (roster import route `src/app/api/musicians/import/route.ts`, manual add) **or** at offer-send (`src/app/api/offers/send-email/route.ts`). Prefer a single deterministic hook — **decide and document which**; if a DB trigger on `musicians` insert is cleaner, propose it rather than scattering RPC calls. If this reveals that the linking model needs schema change, **STOP and write it up** (this is exactly the kind of "deeper problem" the guardrails cover).

**Acceptance criteria:**
- A musician with **no** roster record can create an account and reach `/musician`.
- When that musician is later added to a roster (or sent an offer) matching their email, the `musicians` row's `user_id` is set and the offer appears in their portal.
- No `/api/musician/*` route reads org tables with the anon client.

**Tests:** new `src/lib/__tests__/musician-signup.test.ts` — (a) signup with no prior musician row succeeds; (b) link RPC associates a later-created matching row; (c) an unrelated email is never linked. Follow the existing mock style in `offer-lifecycle-behavior.test.ts`.

---

### B2 — "Claim your free account" CTA on gig accept-success  *(loop-critical, size S — MOSTLY ALREADY BUILT)*

**[AUDIT CORRECTION] This is already substantially implemented.** In `src/components/gig/gig-page-client.tsx` **lines 439-476**, after a musician accepts/declines/rescinds, the page renders a portal block: if `musicianHasAccount` is true → "Go to Musician Portal"; **if false → "Manage all your gigs in one place" + "Create a free Podium account…" + a "Create Your Account" button linking to `/musician/register`** (lines 458-473). `musicianHasAccount` is derived from `musician.user_id` and passed down from `src/app/gig/[token]/page.tsx:165`.

**The real gap:** that "Create Your Account" button lands on `/musician/register`, which is **blocked by the roster-match requirement** (B1). A forwarded sub-call recipient with no roster row hits the dead-end today. **So B2 is unblocked by B1** — once B1 lands, verify the full path works. Optional polish: tighten the CTA copy and confirm it renders on the `accepted` state specifically (it currently shows for accepted/declined/rescinded).

**Acceptance criteria:** after a tokenless accept on a mobile viewport, a musician **without** an account sees the CTA and can complete signup end-to-end (requires B1). Existing-account musicians see the portal link.

**Tests:** extend a gig-page render test to assert the CTA appears when `musicianHasAccount=false` and the portal link when true.

---

### B3 — Email footer sweep: linked "Powered by Podium — run your ensemble free"  *(size M)*

**Goal:** Replace the static, unlinked "This email was sent by {organizationName} via Podium." footer with a footer that keeps the org attribution **and** adds a linked CTA **"Powered by Podium — run your ensemble free"** → the marketing signup, across every musician-facing template. Org-custom `footerText` must compose **with** (above) the Podium line, never replace it.

**Current state (verified — the footer is NOT centralized): [AUDIT CORRECTION]** `src/lib/email/templates/email-layout.tsx` exists (footer at lines 58-68) but **most templates do not use its `EmailLayout` wrapper for the footer — each template inlines its own footer** with its own `footerText`/`footerTextStyle` const. So this is a **per-template sweep**, not one edit. The org `footerText` already renders as a separate line **above** the "via Podium" line in each template (e.g. `email-layout.tsx:59-64`, `contract-offer.tsx:249-255`) — so the "compose WITH attribution" structure already exists; you're changing the Podium line into a linked CTA.

**Musician-facing templates to sweep (verified line of the footer string):**
| Template | Footer line |
|---|---|
| `contract-offer.tsx` | 253 |
| `gig-details.tsx` | 232 |
| `gig-details-reminder.tsx` | 96 |
| `offer-reminder.tsx` | 110 |
| `offer-accepted.tsx` | 125 |
| `offer-declined.tsx` | 81 |
| `offer-rescinded.tsx` | 69 |
| `musician-released.tsx` | 89 |
| `music-uploaded.tsx` | 123 |
| `music-reminder.tsx` | 114 |
| `w9-request.tsx` | 106 |
| `portal-invitation.tsx` | 93 |
| `position-unassigned.tsx` | 73 |
| `pre-gig-notification.tsx` | 117 |
| `staffing-alert.tsx` | 146 |
| `sub-request-approved.tsx` | 94 |
| `sub-request-declined.tsx` | 104 |
| `sub-declined-find-another.tsx` | 99 |
| `email-layout.tsx` (shared wrapper) | 62-63 |

**Do NOT add the viral CTA to these (internal/admin or Podium-branded — no forward value):** `admin-offer-sent.tsx:208`, `admin-offer-response.tsx:126`, `admin-sub-request.tsx:123`, `admin-welcome.tsx:84`, `offer-expired.tsx:116`, `offer-expiring-soon.tsx:93`, `musician-welcome.tsx:91` (already Podium-branded). Confirm each recipient audience before deciding; when in doubt, musician-facing = add CTA, admin-to-org = leave.

**Approach (redesign from first principles per David's rule):** the fact that 19 templates hand-roll identical footers is the actual defect. Introduce **one shared footer component** (e.g. extend/adopt `EmailLayout`'s footer or a small `PodiumFooter({ organizationName, footerText })`) that renders: optional org `footerText` line → attribution line with a linked anchor **"Powered by Podium — run your ensemble free"** (`https://www.podiumpersonnel.com/?utm_source=email&utm_medium=footer`). Then replace each inline footer with the shared component. This is the elegant fix and prevents the next drift. Keep plain-text alternatives working (`sendTransactional` sends plain-text too — verify the CTA URL appears in text form).

**Acceptance criteria:** every musician-facing template renders the linked CTA + org attribution; org `footerText` still shows above it; admin templates unchanged; the `email-terminology.test.ts` / render tests still pass; a preview of each template shows the footer correctly in HTML and plain text.

**Tests:** extend `src/lib/__tests__/email-terminology.test.ts` (or add `email-footer.test.ts`) to assert the CTA string + link is present in every swept template and absent from the admin set, and that a provided org `footerText` composes above it.

---

### B4 — Stripe founding-member coupon support  *(size S)*

**Goal:** Support a founding-member discount at checkout and create the coupon programmatically.

**Current state (verified):** `src/app/api/billing/checkout/route.ts` creates the Checkout Session (lines 49-59) with **no `discounts` and no `allow_promotion_codes`**. `scripts/create-stripe-tiers.js` creates the three products/prices idempotently by `lookup_key` but **creates no coupon.**

**Approach:**
1. In `create-stripe-tiers.js`, add idempotent creation of a **founding-member coupon** (e.g. `id: 'FOUNDING50'`, `percent_off: 50`, `duration: 'forever'` — match David's D1 decision in `tasks/todo.md`: recommended 50% off forever, capped at 15). Idempotency: look up by coupon id, create only if absent. Keep the TEST/LIVE mode guard the script already has (lines 39, 86). **Do not create the LIVE coupon** — that's an owner action (§4).
2. In `checkout/route.ts`, add support for a promo/coupon. Preferred: `allow_promotion_codes: true` (musician-safe, no code in URL) plus optional `discounts: [{ coupon }]` when the caller passes a validated founding flag. Guard so a normal checkout is unchanged.

**Acceptance criteria:** in Stripe **TEST mode**, a checkout with the founding coupon applies the discount; a normal checkout is unaffected; re-running the script does not duplicate the coupon.

**Tests:** unit-test the checkout body construction (coupon/promo branch present only when requested). Do not hit the live Stripe API in tests — mock `getStripe()`.

---

### B5 — Restrict PAID_TIERS to Ensemble + waitlist for Orchestra/Symphony  *(size S–M)*

**Goal:** For the beachhead, only **Ensemble** is purchasable; Orchestra/Symphony route to a waitlist.

**Current state (verified):** `checkout/route.ts:7` has `const PAID_TIERS: PaidTier[] = ['ensemble', 'orchestra', 'symphony']` and defaults `tier='ensemble'` (line 14). `src/lib/plan.ts` keeps all three tiers with limits (`PLAN_LIMITS`, lines 35-40: free 25/3/1, ensemble 60/∞/1, orchestra 250/∞/3, symphony ∞/∞/∞). **No waitlist table or endpoint exists anywhere** (grep confirmed). **[AUDIT CORRECTION vs plan: waitlist is fully net-new.]**

**Approach:**
1. **Restrict checkout:** change `PAID_TIERS` (or add an allowlist gate) so only `'ensemble'` is accepted; return the existing `apiError('That plan is not available right now…', 400)` for others. Leave `plan.ts` tier definitions intact (Orchestra/Symphony still exist for comped orgs and future launch).
2. **Waitlist capture:** new additive migration (next number — **073**; 068-072 are already applied, see §4) creating a `waitlist` table: `id, email, organization_name, tier_interest (orchestra|symphony), note, created_at`, org-agnostic, RLS allowing service-role insert. New `POST /api/waitlist` route (public, `createServiceClient()`, validate email, 600ms-safe if it ever loops, rate-limit-friendly). Follow the additive-migration house rule (`-- verify` block, backup-before-apply — David applies).

**Acceptance criteria:** attempting to check out Orchestra/Symphony is rejected; Ensemble checkout works (TEST mode); waitlist POST inserts a row; the marketing pricing page (B9) points Orchestra/Symphony CTAs at this endpoint.

**Tests:** `waitlist.test.ts` (insert + validation); extend checkout test to assert non-Ensemble tiers are rejected.

---

### B6 — Pre-seeded demo project on org creation  *(size S)*

**Goal:** A new org never sees a cold empty state — seed one illustrative demo project/service so the dashboard is warm.

**Current state (verified):** Org creation is client-side in `src/components/auth/onboarding-form.tsx:100-106` via the RPC `create_organization_with_owner(p_name, p_slug, p_timezone, p_vertical)`. Right after, it best-effort calls `POST /api/organization/seed-skills` (lines 122-126) — a clean, idempotent pattern (`src/app/api/organization/seed-skills/route.ts`) to mirror.

**Approach:** add a new idempotent `POST /api/organization/seed-demo` route (mirror `seed-skills`: `requireOrgAdmin()`, `createServiceClient()`, skip if the org already has any project). It creates one demo project + a sample service (+ maybe a couple of open positions using the org's seeded instruments), clearly labeled "Demo — you can delete this." Call it best-effort from `onboarding-form.tsx` alongside the skills seed. Keep it deletable (it's a normal project, so existing delete/archive rules apply). Do **not** seed musicians (avoids fake-roster confusion).

**Acceptance criteria:** a freshly created org shows a demo project on first dashboard load; deleting it works; re-running the route is a no-op; failure never blocks onboarding.

**Tests:** `seed-demo.test.ts` — creates demo when none exists, no-ops when a project exists.

---

### B7 — 3-email post-signup activation nudge sequence  *(size M)*

**Goal:** After org signup, a 3-email nudge sequence: **(1) import your roster → (2) send your first call → (3) invite your musicians.** Only the transactional welcome exists today (`/api/auth/welcome-email`, `admin-welcome.tsx`).

**Approach:** three new React-Email templates (reuse `EmailLayout`, tone consistent with the deliverability overhaul — no colored headers, text-link CTAs, "Hi" not "Dear"; see the "Email Deliverability Overhaul" section in `tasks/todo.md`). Trigger via a scheduled cron (mirror the existing cron pattern in `src/app/api/cron/*` — Bearer `CRON_SECRET`, respect `CRON_ENABLED` and `EMAIL_SAFE_MODE`) that selects orgs by days-since-signup and by **completion state** (skip "import your roster" if the org already imported a roster; skip "send first call" if an offer already went out; skip "invite musicians" if portal invites were sent). Dedup with a durable stamp (a `sent_activation_emails` marker or a column), not best-effort logging. **600ms delay between sends.** These go to the org **admin** (the customer), so from-name = "Podium."

**Acceptance criteria:** an org that does nothing receives all three, spaced; an org that completes a step is not nagged about it; safe-mode suppresses them; no duplicates on cron re-run.

**Tests:** `activation-sequence.test.ts` — selection logic (which orgs get which email by state + elapsed time), dedup, safe-mode suppression. Render tests for the three templates.

---

### B8 — Friendly public-token 404 / expired / error screens on gig pages  *(size S — MOSTLY ALREADY DONE)*

**[AUDIT CORRECTION] Largely complete.** Ship-review Phase 3 already shipped this:
- `src/app/gig/not-found.tsx` renders a friendly `PublicLinkFallback` ("This offer link is no longer available" + "Go to musician portal" + support link) — `src/components/public-link-fallback.tsx` points logged-out musicians at `/musician/login`, never `/dashboard`.
- Inline status messaging in `gig-page-client.tsx`: expired (478-482), declined (427-431), rescinded (433-437), accepted (311-315).
- The accept route wraps the whole handler in try/catch and redirects back to `/gig/{token}` on error (`accept/route.ts:13-21`); submit buttons have disabled/submitting states (`gig-page-client.tsx:499-527`).

**Your job:** **verify, then polish only.** Confirm the same friendly fallback covers `confirm-details` and `confirm-music` public pages (ship review said it does — verify). Check the decline route mirrors the accept route's try/catch + redirect. If all present, mark B8 verified in the log; add a regression test if none covers the not-found path.

**Acceptance criteria:** every public-token failure mode (missing/expired/already-responded/rescinded/server-error) lands on a friendly, portal-pointed screen — no raw 500, no contractor-login dead-end.

---

### B9 — Marketing: founding-cohort framing  *(size S)*

Marketing site root: **`C:\Users\david\Documents\podium-mkt-deploy\podium-marketing`** — standalone **Next.js 14.1.0**, App Router.

**Current state (verified):**
- Pricing is **hardcoded, not centralized**: `app/pricing/page.tsx` `TIERS` array (lines 30-92): **Free $0** (1 seat / 25 performers / 3 projects), **Ensemble $29**, **Orchestra $79** (`popular`), **Symphony $199** — all matching the app's `PLAN_LIMITS` and `create-stripe-tiers.js`. Prices are **duplicated** in `app/pricing/layout.tsx` metadata (lines 6, 13) and `app/layout.tsx` JSON-LD `AggregateOffer` (lines 113-119). **Keep all copies in sync.**
- All signup CTAs point to `https://app.podiumpersonnel.com/signup` (occurrences: `app/page.tsx:67,323,348`; `app/pricing/page.tsx:290,456`; `app/features/page.tsx:804`; `app/about/page.tsx:432`; `components/VerticalLanding.tsx:66,208`; `Navbar.tsx:119,213`; `Footer.tsx:38`).
- Founding framing today is one editorial line (`app/about/page.tsx:75`). No cohort mechanics anywhere.

**Approach:**
1. Homepage (`app/page.tsx`) + pricing (`app/pricing/page.tsx`): add **founding-cohort framing** — "15 founding spots," founding-member pricing per D1, and **"Built by the leader of four working quartets"** positioning. Keep it honest and consistent with the app (Ensemble is the purchasable tier).
2. **Orchestra/Symphony CTAs → waitlist** (B5): swap their "Start 14-day trial" buttons to "Join the waitlist" pointing at the app's `/api/waitlist` (or a small marketing waitlist form that posts to it). Ensemble keeps the trial CTA.
3. Keep pricing copy **consistent with the app** and across the 3 duplicate locations. If founding pricing changes displayed numbers, update all three + the JSON-LD.

**Acceptance criteria:** homepage and pricing communicate the founding cohort + quartet-leader positioning; Orchestra/Symphony route to waitlist; Ensemble routes to signup/trial; no price drift between the 3 locations and the app.

---

### B10 — Marketing hardening + `/for/string-quartets` primary landing page  *(size S–M)*

**Current state (verified):**
- Verticals live in `lib/verticals.ts` (`VERTICALS` array, `getVertical`, `VERTICAL_SLUGS`). Pages generate from `app/for/[vertical]/page.tsx` via `generateStaticParams` (`dynamicParams=false`). **Six** verticals exist: `orchestras`, `choirs`, `theatre`, `dance`, `churches`, `agencies`. **No `string-quartets` vertical exists** — "quartet" appears only as incidental copy. Adding one = appending a single object to `VERTICALS` matching the `Vertical` interface (lines 22-58); routes, sitemap, nav, footer, and homepage grid pick it up automatically.
- SEO: global metadata in `app/layout.tsx` (metadataBase `https://www.podiumpersonnel.com`, title template, OG image `/og-image.jpg` 1200×630, Twitter card, robots index/follow), Organization+WebSite+SoftwareApplication JSON-LD; per-section `layout.tsx` metadata; `app/sitemap.ts` + `app/robots.ts`. **Single static OG image** (`public/og-image.jpg`) — no dynamic per-vertical OG. **[AUDIT CORRECTION] No `.vercel/` dir and no `vercel.json`** (only `.vercelignore`) — audit's "has a `.vercel` dir" claim is wrong; the Vercel project link lives server-side, so deploy is still a Vercel action (David's, §4).

**Approach:**
1. **Add the `string-quartets` vertical** as the **primary outreach landing page** — a full object in `lib/verticals.ts` with wedding-string-ensemble copy, SEO title/description/keywords, FAQ set, and the quartet-leader positioning. This is the page every cold-outreach click lands on.
2. **SEO/OG check:** verify meta + OG render for the new page (it inherits the static OG unless you add a per-vertical image — note the gap, don't necessarily build dynamic OG). Confirm it's in the sitemap. Validate JSON-LD.
3. **Lighthouse pass:** run Lighthouse on homepage, pricing, and `/for/string-quartets`; record scores in the verification log; fix anything egregious (image sizing, contrast, meta).

**Acceptance criteria:** `/for/string-quartets` builds, is in the sitemap, has correct meta/OG/JSON-LD, carries founding + quartet-leader framing, and passes a reasonable Lighthouse bar; site builds clean (`next build`).

---

## 3. Hardening & verification protocol (the double / triple check)

Execute this as a checklist and **record every result in `C:\Users\david\Documents\Podium\tasks\VERIFICATION-LOG.md`** with pass/fail + evidence (command output, screenshots/preview HTML, Resend/Stripe dashboard notes). Do it in dev only, with **`EMAIL_SAFE_MODE` ON** and the allowlist seeded (`henrydavidphotography@gmail.com`), and **Stripe in TEST mode.**

### 3.1 Test suite
- [ ] `npm run test` (vitest) fully green — baseline is ~180+ tests; capture the count before and after.
- [ ] A new/updated test exists for **every** B-item (B1 signup+link, B2 CTA render, B3 footer sweep, B4 coupon/checkout, B5 waitlist+tier restriction, B6 demo seed, B7 activation selection+dedup, B8 not-found regression). List them in the log.
- [ ] `npx tsc --noEmit` clean and `next build` clean (both apps).

### 3.2 Manual end-to-end trace #1 (pre-existing flow, confirm nothing regressed)
In dev, safe-mode on, allowlisted test address:
- [ ] Org signup → onboarding wizard (verify demo project from B6 appears)
- [ ] Roster import — **both `.xlsx` AND `.csv`** (`/api/musicians/import`)
- [ ] Send an offer → tokenless accept on a **mobile viewport** → verify redirect + accepted state
- [ ] Offer-accepted email renders (preview HTML; confirm footer CTA from B3 present)
- [ ] Sub request (portal) → admin approve (`/api/substitutions/[requestId]/approve`) → substitute one-tap accept
- [ ] **Chair transfer is atomic** — original released, substitute confirmed, no phantom chair (verify against `accept/route.ts:119-149` behavior)

### 3.3 Manual end-to-end trace #2 (the loop — after B1/B2 land)
- [ ] Forward a sub-call link to a **brand-new** email (no roster row) → open `/gig/{token}` → accept → see the "Create Your Account" CTA → complete self-signup → reach `/musician`
- [ ] Add that same email to a roster (or send it an offer) → confirm the account is **linked** (offer shows in portal, `musicians.user_id` set)

### 3.4 Billing trace (Stripe TEST mode)
- [ ] Checkout **Ensemble** with the founding coupon → discount applies
- [ ] Orchestra/Symphony checkout **rejected** (B5)
- [ ] Webhook **idempotency** — replay an event id, confirm no double-processing (`stripe_events` table, migration 064)
- [ ] Downgrade/upgrade path resolves correctly via `resolveOrgPlan` (`plan.ts:86-111`); comped orgs stay Symphony (`is_comped`, lines 87-89)

### 3.5 Security sweep (re-verify ship-review items + every new endpoint)
- [ ] **Decline-race lock:** both decline routes have the optimistic status lock and clear `musician_id` (ship-review High item — verify present, not just claimed)
- [ ] **`project-files` bucket scoping:** confirm the open-bucket finding is closed or documented; do not regress
- [ ] **Cross-tenant checks on every NEW endpoint** (B1 register, B5 waitlist, B6 seed-demo, B7 cron): musician/public routes use `createServiceClient()` and never trust a client-supplied org/id without an ownership check (pattern: `send-gig-details.ts` org check). Admin routes use `requireOrgAdmin()`.
- [ ] **Service-client usage on musician routes** (lessons.md) — audit every `/api/musician/*` and public route you touch
- [ ] **Token entropy/expiry** on gig links: offers mint `randomBytes(32)` tokens with `expires_at`; confirm accept/decline honor expiry (`accept/route.ts:57-60`)
- [ ] **No secrets in client bundles:** grep the built client for `sk_`, service-role keys, `STRIPE_SECRET`; confirm only `NEXT_PUBLIC_*` is client-exposed

### 3.6 Email render audit
- [ ] After the B3 sweep, preview/screenshot **every** template (musician-facing AND admin) — HTML and plain text — and confirm: musician-facing carry the linked "Powered by Podium — run your ensemble free" CTA + org attribution; admin templates unchanged; org `footerText` composes above the attribution.

### 3.7 Error-path audit
- [ ] Expired token, double-accept (race), revoked/rescinded offer, deleted org → each lands on a friendly screen (B8), no raw 500, no data corruption.

### 3.8 Log
- [ ] `VERIFICATION-LOG.md` complete with pass/fail + evidence for all of the above and **zero open criticals** before declaring done.

---

## 4. Owner-action list (things you must NOT do yourself — prepare & document; David executes)

You **prepare, script, dry-run, and document**; David runs these. Put a clear "For David" section at the top of `VERIFICATION-LOG.md`.

**Environment toggles (Vercel):**
- [ ] `EMAIL_SAFE_MODE=false` in prod — **only after** the B3 footer sweep is verified on the allowlist (deliberately LAST).
- [ ] `NEXT_PUBLIC_BILLING_ENABLED=true` — **only** when the first paying customer is ready to check out. While unset, `resolveOrgPlan` grants Symphony to everyone (`plan.ts:91-93`).

**Database migrations (additive; backup-before-apply house rule):**
- [ ] Run **065** (`065_add_org_vertical.sql` — org vertical column), **066** (`066_billing_tiers.sql` — four tiers + `is_comped`; migrates current `plan_tier='pro'` comped orgs), **067** (`067_vertical_seeding_rpc.sql` — DROP-then-CREATE 4-arg `create_organization_with_owner`; **has a deploy-gap hazard, read its header before applying**). **[AUDIT/PLAN CORRECTION]** the plan says "065/066" but 067 is part of the same vertical/billing set and 066 (`is_comped`) is what protects founding orgs once billing is enforced. Migrations **068-072 are already applied** (repertoire/intake/spotify — confirmed in `Podium/tasks/todo.md`).
- [ ] Run your **new B5 waitlist migration (073)** and any B7 dedup-column migration — after David backs up.

**Supabase / infra:**
- [ ] Confirm **PITR / daily backups** enabled (Dashboard → Database → Backups) — still the open launch checkbox.

**Stripe:**
- [ ] Create the founding coupon in **LIVE mode** (`create-stripe-tiers.js` with a live key) — you only prepare/run it in TEST.

**Deploy / DNS:**
- [ ] Vercel **prod deploys** for both apps; **DNS/domain** choices for the marketing site and any outreach cousin domain (D2 in the plan).

**Data-hygiene (prepare scripts + dry-runs; David approves execution):**
- [ ] ~15 no-email duplicate **musician** pairs — the merge script exists (`scripts/merge-duplicate-musicians.js`, backup→dry-run→apply); prepare the dry-run, David approves.
- [ ] Duplicate **"String Quartet" org** (`5ba29961…`) — investigate, prepare an archive, David approves.
- [ ] Repo-root clutter (`bravura-master`, zips, `musician roster.xlsx`) — propose removal, David approves.

---

## 5. Guardrails (do not deviate)

- **No new features beyond the B-queue.** No gold-plating.
- **Respect existing conventions** and `tasks/lessons.md` (service client for musician/org reads, check `.insert()` errors, 600ms email-loop delay, `serverError`/`apiError` helpers, additive-only migrations with `-- verify` blocks).
- **Never touch prod data or live Stripe.** All verification is dev + TEST mode + safe-mode-on.
- **Every change tested.** Nothing merges without a green suite and its own test.
- **Update `C:\Users\david\Documents\Podium\tasks\todo.md`** as B-items complete (check the Phase 1 boxes; note commit state honestly — "written + tested locally, ready to deploy," not "done/live," per the lessons.md "fixed means deployed" rule).
- **Redesign from first principles, but STOP on scope creep.** If a B-item reveals a deeper structural problem (e.g. B1's linking model needs a schema change, or B3's footer sharing exposes a bigger email-architecture issue), **write it up and stop** — root causes over hacky fixes, but a genuine scope change is David's decision, not yours.
- **Root causes only.** No temporary hacks. If a fix feels hacky, it's the wrong fix.

---

## 6. Definition of done (whole brief)

- [ ] **B1–B10 all implemented + tested locally**, tsc + `next build` clean for both apps, full vitest suite green with a new/updated test per B-item.
- [ ] **`VERIFICATION-LOG.md` complete** — every §3 checklist item recorded with pass/fail + evidence, **zero open criticals**, both end-to-end traces passing (including the loop trace after B1/B2), billing trace green in TEST mode, security sweep clean, all templates render-audited.
- [ ] **Owner-action list handed over** — a clear "For David" section listing env toggles, migrations (065/066/067 + new), backups/PITR, LIVE coupon, deploys/DNS, and the data-hygiene dry-runs awaiting his approval.
- [ ] **Marketing deploy-ready** — founding-cohort + quartet-leader framing live in the code, `/for/string-quartets` built and in the sitemap, Orchestra/Symphony → waitlist, pricing consistent across app + all 3 marketing locations, Lighthouse recorded.
- [ ] **`tasks/todo.md` updated** to reflect completed Phase 1 items with honest deploy status.
