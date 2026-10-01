# The plan

**What we are building:** one place where a live-event business turns "we need these people on these calls" into confirmed, informed, accountable crew, with almost no coordinator labor in between. The coordinator states the need once. The system asks, waits, moves on, informs, and reports. The worker gets one link and one place to see everything that concerns them, and nothing that does not.

**How this document relates to the others.** [current-state.md](current-state.md) says what exists. [target-architecture.md](target-architecture.md) says what to change and why, one table per change. [state-machines.md](state-machines.md) says how each state moves. This document says **what order to build it in so that customers feel it**, and how we know each release earned its keep. Where this document and section 8 of target-architecture.md differ on sequencing, this document wins.

---

## 1. The promise, as the customer experiences it

### 1.1 A production coordinator's week today, and after

| Monday morning task | Today (any tool they have, including ours) | After Release 2 |
|---|---|---|
| Client confirms the Acme meeting: load-in Thu 7am, rehearsal 3pm, show 6pm, strike 9pm | Open a spreadsheet. Write the calls. Write the headcount per call. | Create the show from a template (Load-in / Rehearsal / Show / Strike). Type the headcount per call: TD rehearsal+show, A1 all four, 8 hands load-in, 4 hands strike. |
| Find an A1 | Text three people. Wait. Text two more. Forget who said what. | Click Staff. The system offers the first-call A1, waits the time you set, moves to the next on decline or silence, and tells you only when someone says yes or the list runs out. |
| Find 8 stagehands | Group text 15 people. Count replies. Over-book by two to be safe. | Same click. Eight independent cascades run from one ranked pool. The board shows 5 of 8 filled, 2 pending, 1 next in line. |
| Someone on another show the same morning says yes | Nobody notices until Thursday. | The system flags the conflict before the offer goes out, by call, not by day. A load-in hand is free for an evening show elsewhere. |
| Send call times, parking, dock door, dress code | Four separate texts and an emailed PDF. The rehearsal crew gets the strike info by mistake. | One call sheet per call. Each worker gets only their calls. Read receipts show who opened it. |
| Show call moves from 6pm to 5:30pm | Text everyone again. Hope. | Change the time once. Only the people on that call are notified. Each gets a yes/no re-confirm. The board shows who has re-confirmed. |
| A tech drops Wednesday night | Panic texting at 11pm. | The system offers the next candidate on the same list the moment the drop is recorded. You wake up to a filled slot or a clear "list exhausted, pick someone". |
| After the show: who gets paid what | Reconstruct from texts. | Pay summary by worker by call, generated from what each person actually agreed to. Worker sees the same numbers. |
| Six weeks out: is the June crew available? | Blast text. Spreadsheet of replies. | Availability request to 20 people for three dates. One-tap answers. The answers pre-sort the cascade. |

### 1.2 A crew member's experience

| Moment | After Release 2 |
|---|---|
| Gets an offer | A text and an email. Show, role, call time, end time, address, pay, dress. Two buttons. No app, no login. |
| Says yes | A confirmation with calendar links. The offer link now shows "You're confirmed". |
| Wants to see what's coming | One personal link: upcoming calls, pending offers, documents for their calls, pay status. Nothing about calls they are not on. |
| Something changes | A text naming exactly what changed and asking for a re-confirm. |
| Needs to drop | Taps "I can't make it" on the gig page. The coordinator is told, the cascade restarts, and the worker is released cleanly. |
| After the show | Can see the amount, the status (submitted, approved, scheduled, paid), and the pay date. |

### 1.3 A quartet administrator's experience

Identical to today, with three differences they will notice and like: a declined or expired offer can automatically move to the next musician if they turn that on; an offer expires on time instead of up to an hour late; a cancelled gig stops asking musicians to accept it. No new terminology. No new screens unless they turn on a feature.

---

## 2. The non-negotiables that define "wow"

If a release does not meet every row that applies to it, it is not done.

| # | Promise | Measurable test |
|---|---|---|
| W1 | **It asks so you don't have to.** A requirement with a ranked list fills itself or tells you it can't. | Coordinator actions per filled slot ≤ 1 (the click to start). Measured from `staffing_events`. |
| W2 | **It never double-books and never overfills.** | Zero rows from the integrity probes in production, every night. Two simultaneous accepts never both win (Postgres-backed test). |
| W3 | **The worker only sees their own calls.** | Production fixture: no worker page or email names a call the worker is not on. |
| W4 | **One action, not three.** Staffing, call sheets, change notices and re-confirms are each one action. | Walkthrough per release with a real coordinator; count their clicks. |
| W5 | **Minutes, not hours.** Offers expire within 5 minutes of their deadline. Reminders fire on an hourly schedule. SMS delivers in under a minute. | Cron schedule and delivery logs. |
| W6 | **Nothing is lost.** Every offer, response, change and assignment has a who/when/why. | "Why did this person get this job?" answered from `staffing_events` + `assignments` for any seat. |
| W7 | **Quartets feel nothing unless they opt in.** | Identity tests and the quartet fixture byte-identical on every release. |
| W8 | **It's trustworthy.** Tracked migrations, restorable backups, Postgres-backed tests. | A restore drill done once. CI replays migrations on every PR. |

---

## 3. Two tracks, four releases

Track A is engineering hygiene that customers never see but that every promise above depends on. Track B is what they pay for. The releases interleave them so that nothing customer-facing ships on an unguarded cascade, and nothing invisible runs for months without a customer win.

PR numbers refer to [target-architecture.md section 8](target-architecture.md#8-implementation-sequence-pr-sized-steps) where they exist there; new items are marked **new**.

### Release 0: Foundations (Track A only, invisible, do not skip)

Goal: make it safe to touch the cascade on production data.

| Step | What | Why a customer cares eventually |
|---|---|---|
| A0.1 | Run the 12 integrity probes against production (PR 1). | W2. We may already have bad rows. |
| A0.2 | Characterization tests for every uncovered cascade scenario, plus the quartet fixture (PR 2). | W7. |
| A0.3 | The one-line guards: decline cannot evict a seated musician, "viewed" cannot overwrite "accepted", expire cannot vacate a held chair, cancelled projects reject accepts, the staffing-alert threshold bug (PR 3). | W2. These are live defects today. |
| A0.4 | Tenant hardening migration (PR 4). | Trust. |
| A0.5 | Postgres in CI, migration tracking via the Supabase CLI, `schema.sql` labelled dead (PR 5). | W8. |
| A0.6 | **new** Real backups: Supabase PITR, or a nightly dump to R2 with a restore script, and one restore drill. | W8. Must precede Release 1's constraint migration. |
| A0.7 | **new** Start SMS compliance now: register the 10DLC brand and campaign with the chosen provider. This takes weeks of calendar time and no code. | W5 for Release 2. |

Exit criteria: probes clean or repaired with a reviewed script; CI green including the `db` project; a restore drill completed; 10DLC registration submitted.

### Release 1: The cascade that actually cascades (quartets first)

Goal: the product does what its marketing already says. Shipped to the four live orgs as opt-in. This is the first thing a customer feels, and it is also the hardened engine Release 2 is built on.

| Step | What | Promise |
|---|---|---|
| A1.1 | `staffing_events` + `logEvent()` (PR 6). | W6 |
| A1.2 | `src/lib/staffing/` module: one `isLiveOffer()`, one `releaseSeat()`, one `computeOfferPay()` used by email, gig page, calendar and payments (PR 7). | W2, fixes the three leader-fee rules |
| A1.3 | Server-side offer creation, `superseded` status, `created_by`, `pay_basis`, `terms_snapshot` (PR 8). | W6 |
| A1.4 | `claim_chair` and `create_offer` RPCs, partial unique indexes, the confirmed ⇔ musician CHECK, with the reviewed data-repair script first (PR 9). | W2 |
| A1.5 | Lifecycle routes: cancel project, cancel position, deactivate musician, book import, all server-side, all retiring offers and notifying (PR 10). | W2, W6 |
| A1.6 | `assignments` history with backfill (PR 11). | W6 |
| B1.1 | **Auto-cascade** (PR 18, moved here). Per-org flag plus per-position switch. On decline, expiry or supersede: next unconflicted candidate gets an offer; idempotent on (position, triggering offer); stops on filled, cancelled, inactive project, or exhausted list with an admin email. Requires the R-6 fix (never re-suggest the person who just timed out). | **W1** |
| B1.2 | **new** Expiry checked every 5 minutes, reminders hourly, "no expiration" capped at the first call time. | W5 |
| B1.3 | **new** Worker drop: "I can't make it" on the gig page releases the seat, logs, notifies admins, and triggers the cascade when auto is on. Replaces the sub-request flow as the default for non-music verticals; the sub flow stays for music. | W1, W6 |
| B1.4 | **new** Gig page renders every state (superseded, released, expired) with a plain sentence. No more blank cards. | W4 |
| A1.7 | Terminology completion: new term keys, the 8 admin emails that ignore the org vertical, presets and leader-fee field gated (PR 12). Org behaviour flags added to the privileged-column trigger (PR 13). | W7 |

Exit criteria: auto-cascade on for at least one live quartet org for two weeks; W1 measured; quartet fixture byte-identical with the flag off; integrity probes clean nightly.

### Release 2: The production bundle (one release, not four)

Goal: a production company can run a show end to end without seeing a chair, and without a spreadsheet. These ship together because any one alone looks like a relabelled quartet tool.

| Step | What | Promise |
|---|---|---|
| A2.1 | `notify(event, ctx)` channel layer, `email_logs` gains `channel`, failures logged, bounced addresses skipped (PR 22, moved here). Email and SMS become one code path before SMS exists. | W5 |
| A2.2 | `position_services` + `servicesFor()` adopted by every reader, flag off for existing orgs (PR 14). | W3 |
| A2.3 | `requirements` with quantity, materializing positions (PR 16). | W1 |
| A2.4 | Scope-aware substitution and drop (PR 17). | W1 |
| B2.1 | **new Event staffing board.** Calls across, requirements down, each cell shows filled/pending/next-in-line/conflict, with the one-click actions: Staff all, Staff this, Send call sheet, Notify change. This is the coordinator's one place. Built for the `production_crew` vertical; quartet orgs keep the current project page unless they opt in. | W4 |
| B2.2 | **SMS offers** behind `sms_offers`: provider interface, Twilio adapter, consent and STOP, inbound YES/NO mapped to accept/decline through the same RPCs, delivery receipts (PR 23, moved here). | W5 |
| B2.3 | Offer content for crew: show, role, call time, end time, address, room, pay with basis, dress code, notes, two buttons. Offer email and SMS templates per vertical (PR 15 part). | W4 |
| B2.4 | **Call sheet as one action**: per-call document targets (PR 21), a "Send call sheet" action that picks the right people, read receipts per call. | W3, W4 |
| B2.5 | **Change propagation**: editing a call's time, place or notes notifies only affected workers and asks for a one-tap re-confirm; the board shows re-confirm status (PR 15 part). | W4 |
| B2.6 | **new Worker "my schedule" page** on a long-lived personal magic link: upcoming calls, pending offers, documents for their calls, pay status. No login. Rotatable link. | W3 |
| B2.7 | **Availability requests** with one-tap answers feeding candidate sorting (PR 25, moved here). | W1 |
| B2.8 | `production_crew` template rebased from the overhire branch: terms, session types, sections, seeds, three-call-show preset, crew offer template, conduct policy (PR 20). `photo_video` and `staging` as configuration only. | W7 |
| B2.9 | Production fixture passing end to end in CI (PR 19). | W2, W3 |

Exit criteria: one real production company runs one real show on it. Walkthrough click counts recorded against W4. No email or page shown to them contains "chair", "instrument" or "ensemble".

### Release 3: Accountability and money

Goal: the reasons a customer stays.

| Step | What |
|---|---|
| B3.1 | Credentials: org-defined types, expiry, evidence upload on the W-9 token pattern, expiry warnings, candidate warnings (PR 24). Hard filtering per requirement comes only after a customer asks. |
| B3.2 | Worker-visible pay states (submitted, approved, scheduled, paid, paid date) as a presentation layer over `payments`, on the my-schedule page. No schema change to tax records. |
| B3.3 | Permission roles: coordinator and finance, with `has_org_permission()` and UI gates. |
| B3.4 | Reporting: fill rate, time to fill, response rate by worker, from `staffing_events`. The coordinator's proof that the tool works. |

Deferred until a customer demonstrates the need: vendor organizations, RFQs, per-call leads, union pay modeling, seasons.

---

## 4. Dependency order (what blocks what)

```
A0 (probes, guards, CI, backups, 10DLC)
 └─ A1.1-A1.6 (events, module, server-side offers, RPCs + constraints, lifecycle, assignments)
     ├─ B1.1 auto-cascade  ──┐
     ├─ B1.2 fast expiry     │  Release 1 ships
     ├─ B1.3 worker drop     │
     └─ B1.4 gig page states ┘
         └─ A2.1 notify layer
             ├─ A2.2 position_services ─ A2.3 requirements ─ A2.4 scoped subs
             │     └─ B2.1 board ─ B2.4 call sheets ─ B2.5 change propagation
             ├─ B2.2 SMS (needs 10DLC approval from A0.7)
             ├─ B2.6 my-schedule page
             ├─ B2.7 availability
             └─ B2.8 production_crew template ─ B2.9 fixture   Release 2 ships
                 └─ B3.x
```

The critical path is A1.4 (RPCs and constraints). It cannot start until A0.6 (backups) is real, because it changes constraints on production cascade tables.

---

## 5. Validation gates

| Gate | When | Who | Question |
|---|---|---|---|
| G0 | Before A1.4 | Owner | Probe results reviewed. `custom_pay` semantics decided (per service or flat). Repair script approved. |
| G1 | End of Release 1 | One live quartet org | Did auto-cascade fill chairs without you? Would you turn it off? |
| G2 | Before B2.1 | The overhire prospect or one production company | Show them section 1.1. Which three rows would you pay for? Their answer orders B2.x. |
| G3 | End of Release 2 | That company | One real show run on it. Click count per W4. Anything they still did in a spreadsheet is the next backlog item. |
| G4 | Before Release 3 | Owner | Is anyone paying? Which of B3.x did they ask for unprompted? |

---

## 6. What we are not building

CRM, ticketing, registration, seating, hotel blocks, catering, inventory, rental ERP, accounting, proposals/contracts, general project management, floor plans, a marketplace, a public directory, a native app, a logged-in worker portal. The music library stays a music-only module. Vendors are a separate entity designed after Release 2 has paying customers.

---

## 7. Instrumentation from day one

Every promise in section 2 is measurable only if `staffing_events` records enough. From A1.1 onward each event carries: org, project, position, requirement, offer, musician, actor type, action, channel, and outcome. The four numbers we report per org, per month:

- Coordinator actions per filled slot (W1).
- Median time from vacancy to confirmed (W1, W5).
- Offer response rate and median response latency by channel (W5).
- Integrity probe violations (W2), target zero.

---

## 8. Immediate next steps

1. Owner runs the 12 probes against production and pastes the results into the PR for A0.1.
2. Owner decides `custom_pay` semantics and whether PITR or a dump-to-R2 job is the backup path.
3. Owner starts 10DLC registration with the SMS provider (Twilio is the default choice; the code will not depend on it).
4. Engineering starts A0.2 and A0.3 now; they need no decisions.
5. Owner books the G2 conversation with the production prospect for roughly when Release 1 ships.
