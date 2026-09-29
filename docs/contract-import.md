# Create a project from a pasted contract

Added 2026-09-29. Music verticals only (it lives in the template picker).

## What it does

Projects -> Add Project -> **Paste a Contract**. Select the whole 17hats contract
page (menus and legal terms included), copy, paste, click **Read Contract**. The
Add Project form opens already filled in. Nothing is saved until **Create** is
clicked, and every value can be changed first.

| Contract line | Goes to |
| --- | --- |
| `Ensemble:` | Template (quartet / trio / duo / solo) and its empty chairs |
| `Client:` | Client Name, and the project name ("<Client> String Quartet Gig") |
| `Service:` | First line of the Description, and the closest Event Type |
| `Date:` | Date (numeric dates are read month first: 4/3/27 = April 3, 2027) |
| `Venue:` | Performance Venue, with its address (see "How the venue gets its address") |
| `Performance Time:` | Call / Start / End, and copied word for word into the Description |
| `Total Fee:` | Contract Amount |
| `50% Deposit:` | Deposit Amount |
| "Balance is due fourteen (14) days prior..." | Payment Notes, with the actual due date |

## What it warns about

Shown in the amber box above the form. Warnings are not saved.

- The deposit does not match its own percentage label
- The client has not signed yet (the page still shows "Sign Contract")
- The contract names a different company than the organization it is being added to
- The venue could not be pinned down: Google has several places with that name, or none
- The ensemble has no template (the gig is created with the contract's times and venue, no chairs)
- Anything that could not be read: date, times, fee
- No arrival time in the contract (call time is assumed 30 minutes before the start)
- Music that runs past midnight (the form holds one calendar day)

## How the times are read

From the `Performance Time:` sentence only.

- **Start** = the earliest time mentioned (the prelude, not the ceremony)
- **End** = the time after "conclude / end / until", otherwise the latest time
- **Call** = the time in the sentence about the musicians arriving; if that sentence
  only gives a lead ("45 minutes prior") it is subtracted from the start

## How the venue gets its address

Added 2026-09-29.

1. If the org already saved a venue with that name ("The" in front, case and
   punctuation do not matter), that venue is used.
2. Otherwise Google is asked, looking first in the state most of the org's saved
   venues are in, then everywhere.
3. The address is taken only when exactly ONE place carries the name. It is shown
   under the venue box as "Found on Google" with a Maps link.
4. The venue is saved to the org's venues when Create is clicked, not before.
   Changing the venue box drops the found place.

Several places with the name (a club with two locations, a common church name) or
none: nothing is attached and the amber box says so. Pick it from the venue search.

Measured on 28 venues already saved with a known Google place (2026-09-29): 23
right, 2 refused as "several", 2 not found (saved under a street address, not a
name), 1 duplicate saved venue. No wrong address.

## Where the code is

- `src/lib/projects/contract-parser.ts`: the reader. Pure text in, fields and
  warnings out. No database, no network, no AI model. To support a new label or a
  new way of writing times, change it here and add a test.
- `src/lib/__tests__/contract-parser.test.ts`: 41 tests. The fixture is the real
  contract's shape with a fictional client.
- `src/components/projects/project-form-dialog.tsx`: the "Paste a Contract" step and
  the amber box. It fills the existing form; the save path is unchanged.
- `src/components/projects/projects-client.tsx`: a "custom" gig now keeps times it
  was given (needed when a contract's ensemble has no template).

- `src/lib/venue-lookup.ts` + `src/lib/__tests__/venue-lookup.test.ts`: the
  pick-exactly-one rule. 17 tests.
- `src/app/api/venues/lookup/route.ts`: admin-only GET that asks Google and applies
  the rule. Saves nothing. Costs one Google text search per contract read (two
  when the first finds nothing).

No migration.

## Limits

- It reads the office's own contract layout (labelled lines). A contract written as
  free prose, or a PDF, is not read.
- Client email and phone are not in the contract, so they stay empty.
