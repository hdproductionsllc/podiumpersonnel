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
