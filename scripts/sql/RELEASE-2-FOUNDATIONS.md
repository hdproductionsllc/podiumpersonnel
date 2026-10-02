# Release 2 foundations: paste and deploy order

Branch `r2/foundations`. Built in steps; each step adds its section below.
Quartet companies see nothing new except what each step lists under "What
people will notice". Every email, recipient, subject, pay amount and cron is
unchanged (the quartet fixture and the golden-email tests hold this).

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
