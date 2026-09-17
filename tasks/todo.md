# Venue address missing from gig emails (2026-09-16)

Emails show a venue address + Google Maps link only when the gig is LINKED to a saved
venue record (`services.venue_id`). Typing a venue name — even one already saved —
leaves `venue_id` NULL and silently strips the address and the map link.
12 of 42 gigs are affected across PSQ and Subito Strings.

Plan: `C:\Users\david\.claude\plans\starry-orbiting-yao.md`

Decisions: warn (never block) on an unlinked venue; relink existing data but send NO emails.

## Build

- [x] `src/lib/venue-match.js` — shared matching rule (CommonJS so the Node script and the
      app both use ONE implementation). Conservative: lowercase + trim + collapse
      whitespace, punctuation preserved. Never match when 2+ venues tie.
- [x] `src/lib/venue-resolution.ts` — single `resolveVenue()` entry point replacing the
      duplicated auto-create blocks in both dialogs. Returns atomic `{ venue, venueId, status }`.
- [x] `src/lib/__tests__/venue-resolution.test.ts` — incl. the regression guard that two
      same-name venues in one org must NOT auto-link.
- [x] `venue-search.tsx` — opt-in auto-match on a real blur event.
      Guards: `onMouseDown` preventDefault on dropdown buttons (else clicking a venue
      breaks); do not retrigger the `[organizationId, venueId]` refetch (else the input
      flickers disabled on every tab-away); never a `useEffect` on `inputValue`.
- [x] `service-form-dialog.tsx` + `project-form-dialog.tsx` — use `resolveVenue`; inline
      warning keyed on address/maps-URL absence (NOT on `venue_id`); surface failures
      instead of swallowing them in `catch`.
- [x] `venue-form-dialog.tsx` — `initialName` prop; return the created venue from
      `onSuccess`; auto-match stays OFF here (self-match would clobber in-progress edits).
- [x] `projects-client.tsx` — feed the atomic `{ venue, venueId }` into the ~8 template
      service inserts so the two can never be spread apart.
- [x] `send-gig-details-dialog.tsx` — flag addressless venues in the pre-send preview;
      drop its private copy of `getVenueDisplay` and import the shared helper.
- [x] `scripts/link-service-venues.js` — dry-run default, `--apply`, JSON backup first.
      Expect 6 link / 6 need a record / 0 ambiguous.

## Verify

- [x] `npm test` green, incl. the existing `venue-maps-url.test.ts` no-name-only-URL guard
- [x] script dry run shows exactly 6 / 6 / 0
- [ ] BLOCKED — needs a browser: mouse-click a dropdown venue still works; tab-away has
      no flicker; two same-name venues do not auto-link; editing a venue does not clobber
      notes. Chrome extension was not connected. Dev server runs at localhost:3000.
- [x] `npm run build` + `npm run lint` clean
- [x] `--apply` run 2026-09-16: 6 linked, backup in scripts/backups/. Kurtz gig now renders
      "4344 Shaw Boulevard, St. Louis, MO, 63110" + a place-ID map link. No emails sent.

## Do NOT

- Do not send or resend any email.
- Do not loosen `venue-helpers.ts` — its refusal to build a name-only Maps link is
  deliberate and test-protected (a name-only search once pointed musicians at the
  wrong church).
- Push budget: 1.

## Still open

- Whittemore House at Washington University (Oct 11) is the only UPCOMING gig still with
  no address. It has no venue record at all — add one in Settings > Venues with a real
  address, then reopen the gig and pick it.
- Five past gigs likewise have no venue record: 2573 Benedict Canyon Drive, Arlington
  United Methodist Church, Private Residence in Ladue, Castle Green, 344 South Hudson Ave.
- Fridays four musicians still hold the original addressless email (resend was declined).
