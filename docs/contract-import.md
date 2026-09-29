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
| `Venue:` | Performance Venue (linked to a saved venue when the name matches exactly) |
| `Performance Time:` | Call / Start / End, and copied word for word into the Description |
| `Total Fee:` | Contract Amount |
| `50% Deposit:` | Deposit Amount |
| "Balance is due fourteen (14) days prior..." | Payment Notes, with the actual due date |

## What it warns about

Shown in the amber box above the form. Warnings are not saved.

- The deposit does not match its own percentage label
- The client has not signed yet (the page still shows "Sign Contract")
- The contract names a different company than the organization it is being added to
- The venue is not one of the saved venues (so it has no address until picked from the search)
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

No migration and no new API route.

## Limits

- It reads the office's own contract layout (labelled lines). A contract written as
  free prose, or a PDF, is not read.
- The venue's address is not looked up automatically in the form. Pick the venue
  from the search to attach it.
- Client email and phone are not in the contract, so they stay empty.
