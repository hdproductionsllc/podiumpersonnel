## What changed

<!-- One or two sentences. Link the issue or task if there is one. -->

## Database

- [ ] This PR includes a file under `supabase/migrations/` **and I have run it in the Supabase SQL editor** (or it has no migration).

Merging ships the code but never runs the SQL. A migration that is not pasted into the SQL editor by hand is not live, however green the deploy looks. See `tasks/lessons.md` and the 080/081 incident in the README.

## Checks

- [ ] CI is green (typecheck, lint, tests).
- [ ] I tried the change on the live site after the Vercel deploy landed, or noted here why not.
