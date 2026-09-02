# Overhire demo: running the crew-booking skin in front of a real owner

*Built 2026-09-02 on branch `overhire-demo-skin`. Concept and research in `tasks/fork-concept-crew.md`.*

## What this is

The Podium engine wearing a second name. An organization created with the "Production Company" vertical gets the terms Show, Call, Role, Tech, and Crew; a Roles list of A1, A2, L1, L2, V1, V2, camera, graphics, projection, LED, breakout, rigger, stagehand, truck, stage manager, show caller; a "Three-call show" template that creates Load-in, Show Day, and Strike; the wordmark and browser tab read Overhire; and the offer, reminder, accepted, and gig-details emails say "via Overhire". Everything else is Podium as it already works.

Deliberately not built, and to be honest about in interviews:

- **No SMS.** Offers arrive by email with a one-tap link. Techs live in text; this is the first thing the real build adds.
- **No per-call positions.** A tech booked on a show is on every call of that show. A show that needs eight hands for load-in and three operators for the show day cannot yet be modeled precisely. Say so if it comes up; it is the one data-model change the real build needs.
- **No W-9 or payment-status changes.** The existing W-9 request and payments pages work, with crew terms.
- **From-address is still hello@podiumpersonnel.com.** There is no Overhire sending domain.
- **No domain, no marketing site.** The brand exists in-app only.

## One-time setup

1. **Database.** Paste `scripts/production-crew-vertical-2026-09-02.sql` into the production Supabase SQL editor and run it. Both RESULTS rows must say OK. Until this runs, choosing "Production Company" at signup fails.
2. **Deploy.** Merge the branch. Vercel deploys on push to master.
3. **Create the demo org.** Sign up a fresh account at app.podiumpersonnel.com/signup with a different email (a Gmail plus-address works: `henrydavidphotography+overhire@gmail.com`). On the onboarding screen choose **Production Company**. Name the org something like "Gulf Coast Production Services". Roles are seeded automatically.
4. **Seed crew and a show.** From the repo, with `.env.local` present:

```
node scripts/seed-crew-demo.js --org <the new org's id>          # dry run, shows what it would create
node scripts/seed-crew-demo.js --org <the new org's id> --apply
```

The org id is in the dashboard URL or the organizations table. The seed creates 12 crew whose emails are plus-addresses on David's Gmail, one Houston hotel venue, and a two-day show "Acme Corp General Session" with Load-in, Show Day, and Strike and nine open positions. Safe to re-run.

5. **Check the emails land.** Production has email safe mode off, so offers go out for real. Every seeded tech's address routes to David's inbox, so nothing reaches a stranger.

## The live cascade, step by step

This is the two-minute moment the interview is built around. Rehearse it once.

1. Open Shows, open "Acme Corp General Session". The positions list shows A1, A2, L1, V1, LED Tech, and four Stagehand slots, all open.
2. On the A1 position, click Send Offer. The first-call A1 is pre-selected from the call order. Send it.
3. On your phone, open the email. It has the show, the three calls with times and the venue, and the pay. Tap **Decline**.
4. Back on the laptop, the position shows the decline and offers the next A1 on the list with one click. Send it.
5. On your phone, tap **Accept**. The position turns confirmed. Point out that the date is now on the tech's portal and the owner never sent a text.
6. Optional: open Send Gig Details, send the call sheet, and show the read receipt when you open it on your phone.

Then hand them the laptop: "Let's put in the show you did last weekend." Use the Three-call show template, then add roles from their crew list.

## The interview

Do not lead with the software. In this order:

1. "Show me how you staffed your last show." Watch. Count the group texts, the spreadsheet, the calls, the copied call sheet, the manual replacement when someone dropped.
2. "What broke in the last three months?" Double booking, a no-show, a tech who held a date then bailed, someone paid late.
3. "Let me show you how I'd staff that same show." Run the cascade above with their show.
4. The real question: "I want three companies to beta this on a real show. Would you actually use it?" Only if yes: "It's $99 a month flat once it's live, unlimited shows."
5. "Can I text you when I have something to look at?"

Record: number of freelancers on their list, whether they hire non-union directly, what they use today, what they said to the beta question, and the exact words they used for their biggest pain.

## The decision after five conversations

| Result | Action |
|---|---|
| 3 or more want to beta | Build SMS and per-call positions (six to eight weeks) |
| 1 or 2 interested | Keep interviewing, do not build |
| Nobody cares | Kill it, keep the research |
| Wedding-vendor friends adopt the event-agency template first | Develop that vertical instead |

Run the wedding-vendor test in parallel: invite three DJ, photo, or booth companies onto an org with the "Entertainment Agency" vertical. Zero build, and it tests whether people you already know will use what exists.

## Where things are in the code

- Vertical template: `src/lib/verticals/templates/production-crew.ts`; roles: `PRODUCTION_CREW_SEEDS` in `src/lib/verticals/seeds.ts`.
- Brand hook: `src/lib/verticals/brand.ts` (`brandFor`), used by the logo, the dashboard tab title, and the four branded email templates.
- Three-call show template: `project-form-dialog.tsx` and the template block in `projects-client.tsx`.
- Migration: `supabase/migrations/084_add_production_crew_vertical.sql`.
- Tests: `src/lib/__tests__/production-crew.test.ts`.
