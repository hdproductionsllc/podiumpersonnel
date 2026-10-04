# Release 2 foundations: paste and deploy order

Branch `r2/foundations`. Built in steps; each step adds its section below.
Quartet companies see nothing new except what each step lists under "What
people will notice". Every email, recipient, subject, pay amount and cron is
unchanged (the quartet fixture and the golden-email tests hold this).

## At a glance: the whole order

All four pastes go in BEFORE the one push, in this order. Each one stops and
changes nothing if the one before it is missing, and each is safe to run
twice.

1. `scripts/sql/097-email-logs-channel.paste.sql` (step 1)
2. `scripts/sql/098-position-services.paste.sql` (step 2)
3. `scripts/sql/099-requirements.paste.sql` (step 3)
4. `scripts/sql/100-production-crew-vertical.paste.sql` (step 4)
4b. `scripts/sql/101-gig-report-client.paste.sql` (the gig report's client
   questions, added 2026-10-04)
4c. `scripts/sql/102-reminder-claims.paste.sql` (no more double reminders,
   added 2026-10-04)
5. Claude runs the read-only lookups listed under steps 2 to 4 (every one
   must answer `200 []`).
6. One push of the branch to `master` (one Vercel build).

Each step's section below says what it adds, what people will notice and
what happens if the code lands before its paste.

## Step 1: one send path (notify), failed sends on record, "Text from my phone"

### Before the deploy

1. Supabase > SQL Editor > New query: paste
   `scripts/sql/097-email-logs-channel.paste.sql` and Run. Every RESULTS row
   should say PASS (INFO rows are counts). It adds three columns to the email
   record (`channel`, `failed_at`, `failure_reason`). Today's live app never
   uses them, so it is unaffected.

### Deploy

2. Push to `master` (one Vercel build), together with the later steps if they
   are ready: one push for the whole branch.

### What people will notice

- **Emails page**: a send the email provider refuses now shows up as a row
  with a red "failed" status and, when opened, "Not sent: <reason>". Before,
  such a send left no trace at all. Nothing changes for emails that went out.
- **Offers table** (a project's offers): an offer still waiting for an answer
  gets a **Text** button (on a phone with the person's number on file) or
  **Copy message** (on a computer, or with no number). It opens the admin's
  own messaging app with a short message and the person's offer link filled
  in. Podium sends nothing; the admin presses send, or doesn't.
- Nothing else. Who is emailed, what the emails say, the pay shown and every
  cron are unchanged.

### If something goes wrong

- Code live but 097 missing: emails go out exactly as before; a failed send is
  still recorded, with the reason kept in the row's details instead of its own
  column (the Emails page shows it either way), and the server log says
  "migration 097 ... has not been applied". Paste step 1.
- The Text button is only a link; it cannot send or change anything.

### Not done on purpose (owner decisions)

- No text messages are sent by Podium: no Twilio, no 10DLC registration. The
  notify layer has a channel field and a provider interface with only an email
  provider, so a later "connect your own texting account" plugs in there.
- Bounced addresses are NOT skipped: who is emailed is unchanged. The app
  marks a bouncing musician (migration 087, "Email bouncing" badge) and that
  is all, as before.

## Step 2: which calls a chair works (position_services), no screens yet

### Before the deploy

1. Supabase > SQL Editor > New query: paste
   `scripts/sql/098-position-services.paste.sql` and Run (after step 1's
   097). Every RESULTS row should say PASS (INFO rows are counts). It adds:
   an organization switch `call_scoped_requirements` (off for everyone, and
   only Podium can change it), a per-chair setting `scope_mode` ('all' for
   every chair), the `position_services` list (empty), the rules that keep
   them consistent, and a chair-aware version of the two database steps that
   look at a gig's services (auto-offer's "booked elsewhere", "I can't make
   it"'s "has it started"). With every chair on 'all' those answer exactly as
   before, so today's live app is unaffected.

2. Right after the paste, before the deploy: Claude runs four read-only
   lookups against the live database's web interface (no rows are read:
   each asks for zero rows, so only "is this question valid" comes back).
   They prove the new code's questions are understood by the live database
   before any page asks them. Every one must answer `200 []`:

   ```
   GET /rest/v1/project_positions?select=id,scope_mode,position_services(service_id)&limit=0
   GET /rest/v1/project_positions?select=id,position_services(service_id)&limit=0
   GET /rest/v1/contract_offers?select=id,project_position:project_positions!inner(project_id,scope_mode,position_services(service_id))&limit=0
   GET /rest/v1/projects?select=id,services(id),project_positions(id,scope_mode,position_services(service_id))&limit=0
   ```

   Recorded 2026-10-02, BEFORE 098 (expected to fail, and how it fails
   matters): the first three answered `400 PGRST200 "Could not find a
   relationship between 'project_positions' and 'position_services'"`. That
   is exactly the error the code's fallback (`withScope`, `isMissingScope`)
   recognises, so code deployed ahead of the paste reads without the scope
   fields instead of failing. `projects?select=id,services(id),project_positions(id)&limit=0`
   answered `200 []`. If any lookup answers anything but `200 []` after the
   paste, do not deploy: paste the answer back to Claude.

### Deploy

3. Same single push as step 1.

### What people will notice

- Nothing. No screen sets a chair's calls yet (that is the next step), and
  the database refuses a chair limited to some calls unless the
  organization's switch is on, which it is for nobody. Every reader that
  shows a person their gig, pays them or checks whether they are free now
  asks "which services does this chair work?" (`src/lib/staffing/scope.ts`,
  `servicesFor`), and for a chair on the whole gig the answer is the gig's
  services, the very same list. The identity tests run every one of those
  readers on the quartet wedding with and without the new fields and compare
  every email argument, log row, read and write.

### If something goes wrong

- Code live but 098 missing: every reader notices the missing fields, reads
  again without them (every chair then works the whole gig, which is what
  every chair is) and the server log says once "migration 098 ... has not
  been applied". Paste step 2.
- To undo in the database: nothing reads `position_services` or `scope_mode`
  unless a chair is 'selected', and none can be while the switch is off.

### What scoping does once a chair is limited to some calls (for the next steps)

- The person is offered, reminded, confirmed, sent gig details, given a
  calendar file and shown a gig page for those calls only; the date in their
  email subjects is their first call.
- Pay: each service's rate for those calls only. An agreed whole-gig amount
  is still owed once, against their first call.
- Conflicts (suggestions and auto-offer): a clash only counts during a call
  this chair works, against a call the other chair works.
- "I can't make it": allowed until their own first call starts.
- Staffing alert: only chairs with a call still ahead count, dated by the
  first call an open chair still has to work. Pre-gig reminder: counts the
  confirmed people who work a call.
- Send Offer dialog's "booked on another gig" warning: compares the calls
  this chair works with the calls the person's chairs on the other gig work,
  the same answer as the server's conflict check.
- Music emails (send music, music reminder): the subject is dated by the
  person's first call, like the gig-details email.
- A chair limited to no calls works nothing (it never widens back to the
  whole gig): no calendar file, no pay lines. An offer for it is refused
  ("This chair is not set to work any of the gig's services"), the
  auto-offer skips it (recorded as `cascade.skipped`, reason
  `chair_works_nothing`), and Generate Payments says how many confirmed
  chairs have an agreed fee it could not pay, instead of skipping them
  silently.
- A chair or service that is paired in `position_services` cannot be moved
  to another gig (the database refuses; clear the chair's calls first). No
  screen moves either today.

### Still to adopt when the scope screens land

- The calls picker itself (gated by `call_scoped_requirements`).
- Anything new that reads "the gig's services" for a person must go through
  `servicesFor` / `servicesForMusician`.

## Step 3: crew by the dozen (requirements) and the call picker

### Before the deploy

1. Supabase > SQL Editor > New query: paste
   `scripts/sql/099-requirements.paste.sql` and Run (after step 2's 098; if
   098 is missing it stops and changes nothing). Every RESULTS row should say
   PASS (INFO rows are counts). It adds: a `requirements` list (role, how
   many, pay for the whole engagement per person, notes, open/filled), a
   `requirement_id` on each chair (empty for every chair), a rule that keeps
   "filled" in step with the chairs, and two database steps the server calls:
   "make this requirement and its chairs" and "set which calls this chair
   works". Both refuse a company whose switch is off (every company), so
   today's live app is unaffected.

2. Right after the paste, before the deploy: Claude runs these read-only
   lookups (zero rows each). Every one must answer `200 []`:

   ```
   GET /rest/v1/requirements?select=id,quantity,project_positions(id)&limit=0
   GET /rest/v1/requirements?select=id,project_id,instrument_id,quantity,default_pay,notes,status,created_at,project:projects!inner(organization_id)&limit=0
   GET /rest/v1/project_positions?select=id,scope_mode,requirement_id,position_services(service_id),project:projects!inner(organization_id)&limit=0
   GET /rest/v1/organizations?select=call_scoped_requirements&limit=0
   ```

   Recorded 2026-10-02, BEFORE 098 and 099: the first two answered `404
   PGRST205` (no `requirements` table), the third `400 PGRST200` (no
   `position_services`), the fourth `400 42703` (no switch column). The code
   copes with each: the projects page reads the switch first and, on 42703,
   shows nothing new (quietly); the staffing alert reads requirements on their
   own and, on any error, lists chairs exactly as before.

### Deploy

3. Same single push as steps 1 and 2.

### What people will notice

- Quartet companies (every company today): nothing. Their projects page asks
  one extra question ("is the switch on?"), gets "no", and renders exactly as
  before. The staffing alert for a gig with no requirements is the same email
  (a golden file rendered from master's template proves it byte for byte).
- Only once Podium turns a company's switch on (none yet; production crew
  companies get it by default in the next step):
  - **Add crew** on a gig's Staffing section: role, how many, which calls
    (every call, or only some), pay per person for the whole engagement,
    notes. It makes that many slots at once, numbered after the role's
    existing slots (Stagehand 1-8 for the load-in, then 9-12 for the strike).
    A double click or retry does not make a second set.
  - A summary line per requirement above the table: "Stagehand × 8, Load-in,
    3 of 8 confirmed, 2 offered, $200 each".
  - Under each slot's role: which calls it works. A **Calls** button sets
    them (every call, or only some). It is greyed out while someone holds or
    is considering the slot: their offer named its calls.
  - Send Offer on a slot of a requirement suggests the requirement's pay; the
    rate total it shows is over that slot's calls.
  - "Text from my phone" dates the message by the slot's first call.
  - Staffing alert: the open slots of one requirement are one line,
    "Stagehand (Load-in): 3 of 8 still open (...)"; two requirements for one
    role stay two lines.

### If something goes wrong

- Code live but 099 missing: no company has the switch on, so nothing asks
  for requirements; the staffing alert's own read fails quietly and it lists
  chairs as before. Add crew and the Calls button would answer "This needs a
  database update first. Nothing was changed." Paste step 3.
- To undo in the database: no chair has a `requirement_id` and no
  requirement exists until a company with the switch on adds one.

## Step 4: the production_crew vertical ("Overhire")

### Before the deploy

1. Supabase > SQL Editor > New query: paste
   `scripts/sql/100-production-crew-vertical.paste.sql` and Run (after step
   3; if 098 is missing it stops and changes nothing). Every RESULTS row
   should say PASS (INFO rows are counts). It:
   - allows a new kind of organization, `production_crew` ("Production
     Company");
   - makes a NEW production company start with `call_scoped_requirements`
     on (Add crew, the Calls button) and, through 096's existing rule,
     `allow_worker_drop` on. `auto_cascade` stays off, as for everyone;
   - makes an organization's kind (`vertical`) something only Podium can
     change, like billing. Nothing in the app changes it after sign-up.
   No existing organization changes: all six are `music_contractor` (checked
   read-only on 2026-10-02) and keep every switch.

2. Right after the paste, before the deploy: Claude runs these read-only
   lookups (zero rows each). Every one must answer `200 []`:

   ```
   GET /rest/v1/organizations?select=id,vertical&limit=0
   GET /rest/v1/projects?select=id,organization:organizations(id,name,timezone,vertical,email_logo_url,email_brand_color,email_footer_text)&limit=0
   GET /rest/v1/organizations?select=call_scoped_requirements&limit=0
   ```

   Recorded 2026-10-02, before 098: the first two answered `200 []` (the
   `vertical` column is from 065, live since July), the third `400 42703`
   (098 not pasted yet), which step 2's paste fixes.

### Deploy

3. Same single push as steps 1 to 3.

### What people will notice

- Quartet companies (every company today): nothing. The words, the lists,
  the template picker, the emails, the pay and the gig page are the same
  values as before, now read from the music template instead of written into
  each screen. `vertical-identity.test.ts` freezes every one of them against
  an inline copy, and `brand-emails-identity.test.ts` sends the offer,
  reminder, accepted and gig-details emails for a music company and compares
  them byte for byte (sender, recipient, reply-to, subject, HTML, text) with
  golden files written from master's code.
- New sign-ups: the onboarding picker gets an eighth card, **Production
  Company** ("Book freelance crew onto shows: A1, L1, hands, and everyone in
  between").
- A production company sees:
  - **Words**: Shows, Calls, Roles, Crew / Tech, Slots, Crew Lists, Show
    Docs. The gig page's policy link reads "Tech Policy".
  - **Brand**: the sidebar wordmark and the browser tab say Overhire; the
    offer, reminder, accepted and gig-details emails end "sent by <company>
    via Overhire" with a link to podiumpersonnel.com (overhire.app is not ours yet). The sender address is still
    hello@podiumpersonnel.com (there is no Overhire sending domain).
  - **Roles** seeded in departments (Audio, Lighting, Video, Rigging, Labor,
    Management): A1, A2, Breakout Tech, L1, L2, V1, V2, Camera, Graphics,
    Projectionist, LED Tech, Rigger, Stagehand, Truck / Driver, Stage
    Manager, Show Caller. Every grouped list (Roles, Crew, Add Position, Add
    crew, Call order, the staffing table) groups by those departments.
  - **Call types** in the call form: Load-in, Rehearsal, Show, Breakout,
    Strike, Other. The gig page prints them as "(load-in)", "(show)".
  - **New show**: a picker with **Three-call show** (Load-in, Show Day and
    Strike, then add the crew) and a blank show. A blank show's first call is
    a "Show" call.
  - **No leader fee**: the call form has no Leader Fee field, Send Offer has
    no "Add leader fee" box, and every call is saved with a leader fee of 0.
  - **Gig lead**: nobody leads by role. The after-gig report asks for an
    admin to pick the crew chief ("Pick the gig lead") instead of defaulting
    to Violin 1.
  - **Add crew** and **Calls** (step 3) are on from the start, and so is
    "I can't make it" on the gig page (Release 1). Auto-offer is off.
  - No Saved Ensembles tab.

### Demo org

- Sign up a fresh account, choose **Production Company**, then fill it:

  ```
  node scripts/seed-crew-demo.js --org <the new org's id>                               # dry run: reads only
  node scripts/seed-crew-demo.js --org <the new org's id> --inbox you@gmail.com --apply
  ```

  It refuses any org that is not `production_crew` or has the switch off. It
  adds 12 crew (emails are plus-addresses on `--inbox`), a Houston venue, and
  "Acme Corp General Session" next Friday and Saturday with the three calls
  and its crew list as requirements (A1 and L1 every call; A2, V1, LED the
  show day; 4 hands the load-in, 2 the strike; a rigger load-in and strike).
  It emails nobody. Safe to re-run. See `docs/overhire-demo.md`.

### If something goes wrong

- Code live but 100 missing: everything works as before for every company,
  but choosing "Production Company" at sign-up fails (the database refuses
  the new kind) and the person sees the sign-up error. Paste step 4.
- A production company made before 100 was pasted cannot exist (the
  database refused it), so none can be left with its switch off.
- To undo in the database: no organization is `production_crew` until one
  signs up. Removing the vertical again means re-running 065's CHECK list
  without it (only if none exists).

### Not done on purpose

- No `pay_basis` anywhere: a requirement's `default_pay` is the amount for
  the whole engagement per person (owner decision).
- Leader-fee logic is untouched: a crew simply has no leader fee (0 on each
  call). Generate Payments' gig-lead labelling of older offers still uses
  the music rule; a crew has no leader fee for it to label.
- No SMS. "Text from my phone" (step 1) works for crew as for everyone.
- The other worker emails (rescinded, released, substitute and music emails,
  pre-gig notice) still say "via Podium" for a crew: only the four the demo
  walks through carry the brand.
- The `photo_video` and `staging` templates in the plan's row 20 are not
  added; the database refuses them.

## Added 2026-10-04 (David's requests)

- **Copies of musician emails.** Every email Podium sends a musician also goes
  to that company's owners and admins, marked "Copy: ... (sent to <name>)",
  with a banner and the musician's personal links (accept, decline, report,
  confirm, W-9) switched off. The separate "Offer Sent" summary is replaced by
  the copy of the offer itself. Copies are not listed on the Emails page; a
  copy that fails is. No copy when safe mode held the original back.
  Code: src/lib/notify/copies.ts, called from notify().
- **Gig report: the client.** "Did you interact with the client (couple, host
  or planner)?" Yes / No, and if yes "How did it go?" Positive / Neutral /
  Negative. Shown on the report panel and in the report email; a negative
  experience marks the report "Needs attention". Migration 101 (paste 4b).
- **No more double reminders.** On Oct 1 a gig-details reminder request
  arrived twice and a trio got it twice. Both reminder buttons (gig details,
  music) now claim each person first (src/lib/reminders/claim.ts): at most one
  reminder per person per 10 minutes, enforced by one conditional database
  write, proven with two simultaneous connections in CI. Migration 102
  (paste 4c). Before 102 is applied reminders behave as before.
- **Roster clean-up (done in production 2026-10-04, not part of the deploy).**
  Four same-email duplicates merged with scripts/merge-duplicate-musicians-2026-10.js
  (Rebecca Chung / Becca Hamilton at PSQ; Jaewon Ahn, Sophie Verhaeghe, Ian
  Parvin at Subito Strings). Every reference moved, conflicting values kept in
  notes, backups in scripts/backups/ (git-ignored: personal data).
