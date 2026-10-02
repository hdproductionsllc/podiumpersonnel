# Overhire demo: the crew-booking template in front of a real owner

*First built 2026-09-02 on branch `overhire-demo-skin`; rebuilt 2026-10-02 on
today's engine (Release 2 step 4, `scripts/sql/RELEASE-2-FOUNDATIONS.md`).*

## What this is

The Podium engine wearing a second name. An organization created with the
**Production Company** vertical (`production_crew`) gets:

- the words Show, Call, Role, Tech / Crew, Slot;
- a Roles list in departments: A1, A2, Breakout Tech (Audio); L1, L2
  (Lighting); V1, V2, Camera, Graphics, Projectionist, LED Tech (Video);
  Rigger (Rigging); Stagehand, Truck / Driver (Labor); Stage Manager, Show
  Caller (Management);
- call types Load-in, Rehearsal, Show, Breakout, Strike;
- a **Three-call show** template (Load-in, Show Day, Strike);
- **Add crew** ("4 stagehands for the load-in, $300 each") and a **Calls**
  button per slot, so each tech is offered, paid and shown only the calls
  they work;
- "I can't make it" on the tech's gig page, so a drop frees the slot;
- no leader fee, and no "Violin 1 leads by default": the admin picks the
  crew chief;
- the wordmark and browser tab read Overhire, and the offer, reminder,
  accepted and gig-details emails say "via Overhire".

Everything else is Podium as it already works: the ranked call list, Send
Offer, the gig page, "Text from my phone", Generate Payments, the W-9 request.

Be honest in interviews about what it does not do:

- **No texting from Podium.** Offers arrive by email with a one-tap link.
  "Text from my phone" opens the admin's own messaging app with the message
  filled in; nothing is sent automatically.
- **Auto-offer is off** for the demo org, as for everyone. "Offer the next
  person when someone says no" is one click on the slot.
- **From-address is still hello@podiumpersonnel.com.** There is no Overhire
  sending domain, domain or marketing site; the brand exists in-app only.
- The less common emails (an offer withdrawn, a release, the music emails)
  still say "via Podium".

## One-time setup

1. **Database.** The Release 2 pastes, 097 to 100, in order
   (`scripts/sql/RELEASE-2-FOUNDATIONS.md`). Until 100 runs, choosing
   "Production Company" at sign-up fails.
2. **Deploy.** The one push of the Release 2 branch.
3. **Create the demo org.** Sign up a fresh account at
   app.podiumpersonnel.com/signup with a different email (a Gmail
   plus-address works). On the onboarding screen choose **Production
   Company**. Name it something like "Gulf Coast Production Services". Roles
   are seeded and its switches set automatically.
4. **Seed crew and a show.** From the repo, with `.env.local` present:

   ```
   node scripts/seed-crew-demo.js --org <the new org's id>                               # dry run, reads only
   node scripts/seed-crew-demo.js --org <the new org's id> --inbox you@gmail.com --apply
   ```

   The org id is in the organizations table. The seed creates 12 crew whose
   emails are plus-addresses on `--inbox`, a Houston hotel venue, and a
   two-day show "Acme Corp General Session" with Load-in, Show Day and Strike
   and its crew list: A1 and L1 on every call; A2, V1 and LED on the show
   day; 4 stagehands for the load-in and 2 for the strike; a rigger for the
   load-in and strike. It refuses any org that is not a Production Company,
   emails nobody, and is safe to re-run.
5. **Check the emails land.** Production has email safe mode off, so offers
   you send go out for real. Every seeded tech's address is a plus-address on
   your own inbox, so nothing reaches a stranger.

## The live cascade, step by step

The two-minute moment the interview is built around. Rehearse it once.

1. Open Shows, open "Acme Corp General Session". The staffing table shows
   the crew list by department, and under each slot the calls it works
   (Stagehand 1 to 4: Load-in; Stagehand 5 and 6: Strike).
2. On the A1 slot, click Send Offer. The first A1 on the call list is
   pre-selected and the pay is the requirement's $1,150 for the whole show.
   Send it.
3. On your phone, open the email. It has the show, the A1's calls with
   times and the venue, and the pay. Tap **Decline**.
4. Back on the laptop, the slot shows the decline and offers the next A1 on
   the list with one click. Send it.
5. On your phone, tap **Accept**. The slot turns confirmed.
6. Open a stagehand's offer on your phone: it lists the load-in only.
7. Optional: on an offer still waiting, press **Text** (on a phone) or
   **Copy message** to show "text from my phone".

Then hand them the laptop: "Let's put in the show you did last weekend."
Use the Three-call show template, then **Add crew** role by role.

## The interview

Do not lead with the software. In this order:

1. "Show me how you staffed your last show." Watch. Count the group texts,
   the spreadsheet, the calls, the copied call sheet, the manual replacement
   when someone dropped.
2. "What broke in the last three months?" Double booking, a no-show, a tech
   who held a date then bailed, someone paid late.
3. "Let me show you how I'd staff that same show." Run the cascade above
   with their show.
4. The real question: "I want three companies to beta this on a real show.
   Would you actually use it?" Only if yes: "It's $99 a month flat once it's
   live, unlimited shows."
5. "Can I text you when I have something to look at?"

Record: how many freelancers are on their list, whether they hire non-union
directly, what they use today, their answer to the beta question, and the
exact words they used for their biggest pain.

## Where things are in the code

- Template: `src/lib/verticals/templates/production-crew.ts`; roles:
  `PRODUCTION_CREW_SEEDS` in `src/lib/verticals/seeds.ts`; call types and
  departments: `CREW_SERVICE_TYPES` (`src/lib/validations/projects.ts`) and
  `CREW_SECTIONS` (`src/lib/validations/instruments.ts`).
- Today's music values for the same fields: `src/lib/verticals/defaults.ts`,
  frozen by `src/lib/__tests__/vertical-identity.test.ts`.
- Brand: `src/lib/verticals/brand.ts` (`brandFor`, `productTitleFor`), used by
  the logo, the dashboard tab title, and the four branded email templates
  through `PodiumFooter`'s `brand`.
- Three-call show: `threeCallShowServices` in `src/lib/verticals/presets.ts`,
  offered by `project-form-dialog.tsx`, created in `projects-client.tsx`.
- Migration: `supabase/migrations/100_production_crew_vertical.sql`.
- Tests: `src/lib/__tests__/production-crew.test.ts`,
  `production-crew-migration.test.ts`, `brand-emails-identity.test.ts`,
  `db/production-crew-vertical.test.ts`.
