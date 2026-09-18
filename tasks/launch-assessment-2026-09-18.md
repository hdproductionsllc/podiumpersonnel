# Launch assessment — 2026-09-18

Question asked: are we in shape to pitch Podium to music groups, freelancers, dance
studios and anyone who staffs calls regularly? How far away are we, what bugs need
ironing out, are we solving a real need, and how do we find clients?

Method: six parallel code audits (onboarding funnel, offer engine, multi-tenant
security, operations, freelancer side, product-vs-marketing) plus local typecheck,
tests and lint. Every blocker below was re-verified by reading the cited file.
Prior market research (tasks/v2-strategy.md, the Sept 1 eval) was reused, not redone.

## Verdict in one paragraph

The product works and is genuinely good for the segment it was built for: a
contractor running several ensembles who books the same pool of players over and
over. Onboarding, empty states, send-offer validation, W-9/1099, QuickBooks export,
Stripe, cron auth and the accept/decline mechanics are solid. But it is NOT safe to
hand to strangers yet: two exploitable cross-tenant holes, one data-corrupting race
in an admin path, and a set of "nobody would know it broke" operational gaps.
Roughly two focused weeks of engineering separates today from "safe to charge a
stranger", and none of it is architectural. The bigger open question is not code:
there is still no evidence that anyone outside David's own brands will pay, and the
five customer conversations recommended on Sept 1 have not happened.

## Local checks (2026-09-18)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 723 pass, 34 skipped; 2 files (cron-auth, cron-retry) time out only under load and pass alone. Cause: 10s default hookTimeout on the dynamic `@/lib/cron` import |
| `npx eslint .` | 717 errors, 4055 warnings, advisory in CI |
| Overhire branch (PR #17) | 6 commits, 17 behind master, needs a rebase |

## A. Launch blockers (fix before a stranger signs up)

### A1. Any signed-up user can make themselves owner of any org — SECURITY
`supabase/migrations/001_initial_schema.sql:216-218` creates
"Users can insert their own membership" with `WITH CHECK (user_id = auth.uid())`
and no organization_id binding. No later migration drops it (grepped 001–083).
A fresh signup with no membership yet can insert
`{user_id: self, organization_id: <any>, role: 'owner'}` from the browser with the
anon key and become admin of another tenant. Migration 077's UNIQUE(user_id)
only blocks a second row.
Fix: drop the policy. Memberships are created only by
`create_organization_with_owner()` (SECURITY DEFINER) and the invitation path.
Add a test that the direct insert is rejected.

### A2. project-files storage bucket has no org scoping — SECURITY
`supabase/migrations/041_project_files.sql:169-188`: SELECT/INSERT/DELETE on
storage.objects check only `bucket_id = 'project-files' AND auth.uid() IS NOT NULL`.
API routes do org checks, but anyone authenticated can call the Storage SDK
directly with a guessed or shared `{orgId}/{projectId}/{uuid}.pdf` path and read
or delete another org's files.
Fix: policies must check the first path folder against `is_org_member(...)`,
mirroring what migration 076 did for gig_detail_sends.

### A3. Rescind can overwrite an acceptance — DATA CORRUPTION
`src/app/api/positions/[positionId]/rescind-offer/route.ts:75-116` fetches the
offer with `.in('status',['pending','viewed'])` then updates by id with NO status
guard. If the musician accepts between fetch and update, the offer becomes
'rescinded' while `project_positions` says confirmed. Same race class that was
fixed in the expire cron and in `src/lib/offers/respond.ts`.
Fix: repeat the status filter on the update and treat 0 rows as "already answered".

### A4. Unassign deletes offer history
`src/app/api/positions/[positionId]/unassign/route.ts:86-94` hard-deletes
contract_offers rows for the position, including an `accepted` record. Every
other transition preserves history. In a pay dispute "did they accept?" becomes
unanswerable. Fix: status change ('released'/'rescinded'), never delete.

### A5. Substitution approve/decline are unguarded and not retry-safe
`src/app/api/substitutions/[requestId]/approve/route.ts:51,159-186` and
`decline/route.ts:56`: status is checked at fetch, side effects (create musician,
insert offer, send email) run, and the final update has no
`.eq('status','pending_approval')`. A double-click or two admins produce duplicate
offers and emails. Zero tests cover substitutions.
Fix: conditional update first, then side effects; add tests.

### A6. A suppressed email looks like a sent email
`src/lib/email/send.ts:138-140` returns `{id:null}` (a success shape) when safe
mode suppresses every recipient; `send-offer-dialog.tsx:544` then toasts
"Call sent!". If EMAIL_SAFE_MODE is ever misconfigured in prod, the admin is told
it went out and the musician gets nothing until the cron expires it.
Fix: return a distinct `suppressed` result and surface it in the UI and email_logs.

### A7. Backups are a laptop cron
`docs/runbooks/database-safety.md`: PITR "unconfirmed" since July;
`scripts/backup-database.js` runs on David's PC at 09:00 and excludes Storage and
auth.users. Data-loss window is up to 24h or more, and uploaded files are never
backed up. Fix: enable Supabase PITR before charging anyone.

### A8. Nobody is told when things break
- Sentry is inert unless `NEXT_PUBLIC_SENTRY_DSN` is set in Vercel (unverified).
- All 7 cron routes `console.error` on failure; none call `serverError()` or
  Sentry (`src/app/api/cron/*/route.ts`).
- No Resend bounce/complaint webhook: a dead address shows "sent" forever.
- No payment-failed (dunning) email; `invoice.payment_failed` only flips status.

### A9. Venues RLS fix exists only as a paste script
`scripts/venue-policies-2026-09-17.sql` is still "on David" per tasks/todo.md and
is not a numbered migration; any rebuild (staging, disaster recovery) reproduces
the bug. Land it as a numbered migration and apply it.

## B. Unverified (production reads were blocked in this session)

Run in the Supabase SQL editor and check Vercel → Settings → Environment Variables:
- `select * from app_settings;` → is `billing_enforced` true? Memory says billing
  went live 2026-07-12; the README and the onboarding audit say the flag is
  dormant. Both cannot be right. If it is off, every stranger currently gets the
  Symphony tier free.
- Is `NEXT_PUBLIC_SENTRY_DSN` set in Production?
- Are migrations 073–083 applied? (pattern in memory project_migrations_not_auto_applied)

## C. Product gaps by audience (what a prospect would hit in week one)

### Freelancer side (any vertical)
- No pre-gig reminder to the performer; the `pre-gig-reminders` cron emails admins only.
- No re-notification when venue/time changes after acceptance; no "payment sent".
- Response deadline is in the email but not on the accept page (`gig-page-client.tsx:440`).
- No SMS anywhere (`group-text-dialog.tsx` just opens the admin's own phone).
- Good: accept/decline are POST forms (scanner-safe), .ics plus Google Calendar
  link, confirmation email, mobile layout, List-Unsubscribe header.

### Non-music verticals (choir/theatre/dance/church/agency)
The terminology engine is real but leaks in exactly the places a first-time user sees:
- `src/app/musician-policy/page.tsx:6-28` DEFAULT_POLICY is literal orchestra
  prose ("music and equipment", "personnel manager") shown to every org that has
  not written a custom policy.
- `src/lib/email/templates/contract-offer.tsx:112,220,230` "Ensemble:", "tuning or
  essential cues", "stand", "cases out of sight" in every offer email.
- `books-client.tsx:171` "No ensembles match"; `gig-page-client.tsx:456` "Musician
  Policy" link label; `sub-request-form.tsx:157` "Instrument *"; fallbacks to
  'Orchestra'/'Instrument' in three token pages.
- No AV/production-crew vertical on master (only on the unmerged overhire branch).
- No certifications with expiry, no availability polling, no rotation call order.

### Marketing site vs app
- Pricing page sells "Multi-ensemble management" at Symphony; nothing in the app
  does this (no org switcher). Clearest overpromise.
- Features page: "auto-sync to Google Calendar ... updates automatically" is a
  one-time .ics/link add, not a subscribed feed.
- "No-Account Access" is marketed honestly; there is no portal and the site does
  not claim one.

## D. Are we solving something people need?

Evidence FOR: the same-person-hires-the-same-pool loop is real and David's four
brands use it daily. Cascade booking plus W-9 plus QuickBooks in one tool has no
lightweight competitor at $29–79 (Rhapsody is ~$100/mo plus $500 setup; OPAS is
enterprise; Planning Center refuses paid musicians; Back On Stage is $49–149 for bands).

Evidence AGAINST: zero paying customers; all 6 orgs comped and 4 are David's;
since July nearly all engineering went into the music library and book builder
(tools for David's own operation); the five customer conversations gated on
Sept 1 are not recorded anywhere; wedding-quartet contractors have never been
asked if they would pay.

Audience by audience:
- Music groups (contractors, community orchestras, churches with paid subs):
  YES, the product fits today. Best first targets.
- Freelancers: NOT customers. They are the free side and the growth channel
  (each of the 900+ roster musicians plays for other contractors).
- Dance STUDIOS (teaching businesses, sub teachers): NO. The dance template is
  built for companies casting productions; studios need recurring class rosters.
  Dance COMPANIES: plausible, but only as a generic roster tool.
- AV/production crews: strongest non-music fit per research, but not on master.

## E. How to actually find clients (do this before more features)

1. The roster IS the lead list. Export musicians and, for each, note the other
   contractors, community orchestras, churches and pit gigs they play. Ask the
   20 most connected: "who books you elsewhere, and how do they do it?" Warm
   intros beat cold email in this world.
2. St. Louis first. AFM Local 2-197 contractors, the community orchestras
   (St. Louis Civic Orchestra, Metropolitan Orchestra of St. Louis, University
   City Symphony, Compton Heights Concert Band), church music directors who pay
   section leaders (cathedrals, large Presbyterian/Lutheran), the Muny/Stages pit
   contractors. You can demo in person.
3. Wedding/event contractors in other cities: multi-ensemble string brands are
   exact clones of your use case. Reach the owner with "I run four of these in
   STL, this is what I built to stop texting players".
4. Personnel-manager communities: League of American Orchestras personnel
   manager network and conference, Facebook "Orchestra Personnel Managers" and
   regional groups, ACDA/NPM/AGO chapters for church music directors.
5. Offer: free until they send 25 offers, then $29/$79; you do the roster import
   for them (bulk import exists). Ask for a 20-minute call, not a signup.
6. Record every conversation in tasks/customer-conversations.md: who, what they
   use now, what they would pay, what blocked them. Gate: 3 of 5 say they would
   pay → proceed; otherwise stop building and rethink.

## F. Recommended order

Week 1 (security and data integrity, one PR, one push):
  A1, A2, A9 as numbered migrations with a paste script and RESULTS table;
  A3, A4, A5 with tests; A6.
Week 2 (ops): A7 PITR, verify Sentry DSN, cron failures to Sentry, Resend bounce
  webhook, payment-failed email, resolve section B.
In parallel, non-engineering: section E conversations 1–3.
Only after 3 of 5 "would pay": performer pre-gig reminder, change notifications,
  fix the terminology leaks in C, SMS (10DLC registration takes weeks; start the
  paperwork early if AV crews or orchestras confirm they need it).

Not now: multi-ensemble management (remove it from the pricing page instead),
calendar subscription feeds, a portal, dance studios.
