# Release 1, batch 1: paste and deploy order

The code in this batch needs migrations 092 to 094 in the database **before** it
goes live, and migration 095 only **after** it is live. Follow this order exactly.
Every script runs in one transaction (an error applies nothing), is safe to run
twice, and ends with a RESULTS table: every row should say PASS.

## Before the deploy (Supabase > SQL Editor > New query, one at a time)

1. `scripts/sql/092-staffing-events.paste.sql`: adds the empty history table.
2. `scripts/sql/093-offer-columns.paste.sql`: adds the "replaced" offer status and
   four offer columns. Marks past substitutes' offers (0 today).
3. `scripts/sql/094-repair-before-constraints.paste.sql`: fixes any chair marked
   confirmed with nobody in it. Expected: 0 fixes (production checked 2026-10-02).
4. `scripts/sql/094-cascade-constraints.paste.sql`: the claim_chair and
   create_offer database functions and the confirmed-has-a-musician rule. Stops
   by itself if 092/093 are missing. Today's live code is unaffected by it.

## Deploy

5. Push the batch to `master` (one Vercel build). Wait for the deploy to land.
   Admins with Podium open should **refresh the page** once it has.

## After the deploy

6. `scripts/sql/095-repair-before-unique-indexes.paste.sql`: fixes any chair with
   two open or two accepted offers. Expected: 0 fixes.
7. `scripts/sql/095-one-offer-per-chair.paste.sql`: one open offer and one accepted
   offer per chair, enforced by the database. **Never before step 5**: the old
   code would hit it when accepting a substitute and when re-offering a chair.

## If something goes wrong

- A FAIL row or an error: nothing from that script was applied. Stop and send the
  output to Claude.
- Code live but 094 missing: sending offers returns "database update not
  applied" and accept links bounce back to the gig page. Paste step 4.
