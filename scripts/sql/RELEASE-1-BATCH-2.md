# Release 1, batch 2: paste and deploy order

Auto-offer, faster expiry, quiet-hour reminders, worker drop-out, gig page
sentences. **Auto-offer is OFF for every organization** after this; nothing
automatic happens until an admin turns it on.

## Before the deploy

1. Supabase > SQL Editor > New query: paste
   `scripts/sql/096-auto-cascade-settings.paste.sql` and Run. Every RESULTS row
   should say PASS (INFO rows are counts). It adds the switches (auto-offer off;
   drop-out off for music organizations) and the duplicate-offer guard. Today's
   live app is unaffected by it.

## Deploy

2. Push to `master` (one Vercel build). This also changes the schedules:
   expire-offers every 5 minutes, offer reminders hourly with quiet hours
   (no reminder 9pm to 8am in the organization's time zone).

## Before turning auto-offer on for an organization

3. From the project folder run (read-only, sends nothing):

   ```
   node scripts/preview-auto-cascade.js <organization id>
   ```

   It lists that organization's upcoming gigs and, for each open chair, who
   auto-offer would offer next, at what pay and until when, or that the admins
   would be told nobody is left.
4. If that looks right: Settings > Organization > "Auto-offer to the next
   person". Single chairs can be left out with "Don't auto-offer this chair".

## If something goes wrong

- Turn the switch off: auto-offer stops at once; offers already sent stay open.
- Code live but 096 missing: the switches don't appear and nothing automatic
  happens. Paste step 1.
