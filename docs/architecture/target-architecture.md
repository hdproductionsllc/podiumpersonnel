# Target architecture and implementation sequence

Status: **proposal, Phase 0 deliverable. No code in this document has been implemented.**
Companion documents: [current-state.md](current-state.md) (what exists today), [state-machines.md](state-machines.md) (as-implemented and target state machines), and the four detailed audits under [audit/](audit/).

Repo HEAD audited: `869ece3`. Baseline on that HEAD: `npx tsc --noEmit` passes, `npm test` passes (60 files, 994 tests).

---

## 0. The thesis in one page

Podium already contains most of a generic event-workforce engine. The audits found that the generic spine the v2 strategy named in July 2026 (organizations → roster → projects → services → positions → offers → payments → documents with receipts) is real, and that a terminology/template layer (`src/lib/verticals/`, 7 templates, `organizations.vertical`) is already in production with regression tests that freeze the quartet wording byte for byte. There is even a `production_crew` template with a 16-role seed on the unmerged `origin/overhire-demo-skin` branch.

Three things stand between that and the platform the spec describes:

1. **The cascade engine does not exist.** What the product calls a waterfall is an admin clicking "next in line". Offers are inserted from the browser in two dialogs. Nothing server-side ever sends an offer. The atomic seat claim is two guarded updates with an unguarded revert. Several transitions (decline vacating a chair, the gig page's "viewed" write, the expire cron's vacate, project cancellation) are unguarded and can evict a confirmed musician or book someone onto a cancelled event ([audit C §5, §9](audit/C-offer-cascade-trace.md)).
2. **A position belongs to the project, not to a call.** Everyone confirmed works every service, and pay, conflicts, substitutions, documents, staffing alerts and the after-gig flow all inherit that assumption ([audit D §2.14 #1](audit/D-hardcoded-assumptions-and-reuse.md)). This is the one real data-model change, and the crew research on the branch reached the same conclusion independently.
3. **Safety infrastructure is thin.** No transactions, no DB invariants on the cascade tables, no append-only history, migrations pasted by hand with no tracking, no tests against Postgres, backups from a laptop.

The strategy is therefore not a rewrite. It is: (a) harden the existing cascade until it is the deterministic, concurrency-safe engine the spec requires, behind the same UI; (b) add a small number of tables *alongside* the existing ones so that a position can be scoped to calls and a requirement can have a quantity, with "no rows" meaning today's behaviour; (c) finish the terminology layer so a crew company never sees a chair and a quartet never sees a rigger; (d) only then add SMS, credentials and availability.

Every database noun stays. `musicians` stays `musicians`. `project_positions` stays the unit of offer and payment. Existing quartet rows are never rewritten; they acquire new meaning only through absence (no scope rows = all calls, no requirement row = quantity one).

---

## 1. Design principles applied to this codebase

| Principle (spec) | What it means here |
|---|---|
| Smallest safe change | New tables beside old ones. No renames. No column semantic changes. Compatibility defaults ("no rows = all"). |
| Configuration before branching | Extend `VerticalTemplate` (already the config surface) with the lists and flags that are currently hard-coded: session types, sections, event types, lead-fallback skill, leader-fee on/off, default worker policy, report question set, offer template variant. Start *consuming* the `features.*` flags that exist but are not read ([audit D §1.1](audit/D-hardcoded-assumptions-and-reuse.md)). |
| Separate universal concepts from vertical language | The DB is the universal layer. `TermDictionary` is the language layer. Add the missing keys (gig, sub, offer, lead, section, position, call time) and finish plumbing into API routes, token pages and the 8 admin emails that still ignore the org vertical. |
| Server owns invariants | Move offer creation, position creation/deletion, project cancellation and musician deactivation behind server routes or RPCs. Today they are browser writes under RLS, so there is no choke point at which a new rule can be enforced ([audit C §0](audit/C-offer-cascade-trace.md)). |
| Database-level guarantees | Partial unique indexes on `contract_offers`, a CHECK on `project_positions`, RESTRICT instead of CASCADE where history lives, and plpgsql RPCs for the two multi-row writes that must be atomic (claim, create-with-supersede). |
| Append-only history | One `staffing_events` table written by every transition, plus an `assignments` history table that records how each seat was filled and ended. |
| Feature flags | Per-org flags on `organizations` (the existing pattern: `intake_enabled`, protected by trigger 081) for `call_scoped_requirements`, `auto_cascade`, `sms_offers`, `credentials`. Vertical keys gate vocabulary; flags gate behaviour. |

---

## 2. Target domain model mapped onto the existing schema

Legend: **keep** = existing table, unchanged semantics; **extend** = add nullable columns; **new** = new table alongside.

| Engine concept | Table | Verdict | Notes |
|---|---|---|---|
| Organization | `organizations`, `organization_members` | keep + extend | Add behaviour flags. Permission roles: extend `organization_members.role` CHECK with `coordinator` and `finance` (Phase 2), keep `is_org_admin()` as the write gate for now. |
| Worker | `musicians` | keep | Term layer renders Musician / Crew / Performer. Credentials and per-role attributes live in new tables, not new columns. |
| Role | `instruments` | keep | Per-vertical `sections` list replaces the fixed zod enum; `section` column has no DB CHECK so no migration. Add `UNIQUE (organization_id, lower(name))` after a dedupe probe. |
| WorkerRole | `musician_instruments` | extend | Add `call_order INTEGER NULL` (per-role priority; NULL falls back to `musicians.call_order`), `default_rate NUMERIC NULL`, keep `proficiency`. |
| Event | `projects` | keep | Already generic enough. `ensemble_type` is music metadata and stays. |
| Call | `services` | keep | Already has `call_time`, start/end, two venues, pay. Per-vertical `sessionTypes` adds `load_in`, `strike`, `show_call`, `breakout`. |
| Requirement | `project_positions` | keep + extend | Stays the unit of offer, assignment and payment. Add `requirement_id UUID NULL` (back-pointer when materialized from a quantity requirement) and the `cancelled` status. |
| Requirement (quantity) | `requirements` | **new** | `(id, project_id, instrument_id, quantity, pay_basis, notes, status)`. Materializes N `project_positions` rows. Quartet orgs never create one; the UI keeps adding chairs one at a time. |
| RequirementCall | `position_services` | **new** | `(project_position_id, service_id)` PK. **No rows = every service of the project** (today's behaviour). Honoured through one helper, `servicesFor(position)`. |
| Candidate / Cascade | `position_candidates` | **new** (Phase 3b) | `(project_position_id, musician_id, rank, source, added_by, skipped_at, skip_reason)`. Optional persisted ranked list per position. When absent, `getNextCandidates()` computes as today. Gives auditability and the manual override the spec asks for. |
| Offer | `contract_offers` | extend | Add `superseded` status, `created_by UUID NULL`, `pay_basis TEXT NULL` (`per_service` default, `flat`), `terms_snapshot JSONB NULL`, `delivery_status TEXT NULL`. Partial unique indexes. Nothing existing changes meaning. |
| Assignment | `assignments` | **new** | History of seats: `(id, project_position_id, musician_id, source, offer_id NULL, status, started_at, ended_at, ended_reason, created_by)`. Written alongside `project_positions.musician_id` during the compatibility period. Reads stay on `project_positions` until Phase 3 proves parity. |
| Availability | `competing_schedules` (keep) + `availability_requests`, `availability_responses` | **new** (Phase 6) | Requests are not bookings. Responses feed `findConflicts()` as soft signals. |
| Credential | `credential_types`, `worker_credentials` | **new** (Phase 6) | Org-defined types, expiry, evidence file, verified_by. `requirement_credentials` later. W-9 stays where it is. |
| Document | `project_files` (keep) + `project_file_targets` | **new** (Phase 4) | `(file_id, target_kind position|service|musician|instrument, target_id)`. Existing `scope='assigned'` + `project_file_instruments` remains the music path. |
| Communication | `email_logs` (keep) → `message_logs` view/alias with `channel` | extend (Phase 5) | Add `channel TEXT DEFAULT 'email'`, `provider_message_id`, `failed_at`, `failure_reason`. A `notify(event, ctx)` layer picks channels. SMS provider behind an interface. |
| Payment | `payments` | keep | Presentation mapping only (worker-visible states). Tax records are never rewritten. |
| Audit Event | `staffing_events` | **new** (Phase 1) | `(id, organization_id, actor_type user|musician|cron|system, actor_id, entity_type, entity_id, action, before JSONB, after JSONB, created_at)`. Insert-only RLS. |

What is deliberately **not** split: `project_positions` into separate requirement and assignment tables. The audits show `project_positions.musician_id` is read by payments generation, after-gig, gig details, music sends, staffing alerts and the portal RLS helpers. Splitting it is a rewrite. The `assignments` history table gives the spec's "Assignment distinct from Offer" semantics without moving the seat.

---

## 3. Proposed schema changes, one table per change

Each change lists reason, old → new, migration path, backward compatibility, affected code, test requirement, rollback risk. Migrations are numbered from `091` (master is at `090`; the branch's `084` collides and must be renumbered).

### 3.1 Repair and constrain the cascade tables (migration 091)

| | |
|---|---|
| Reason | No DB invariant stops two live offers or two accepted offers on one chair, or a confirmed chair with no musician ([C R-1, R-9](audit/C-offer-cascade-trace.md)). `substitution_requests.status` default `'pending'` violates its own CHECK ([B §12](audit/B-domain-model-and-tenancy.md)). |
| Old | `contract_offers`: unique on `token` only. `project_positions`: no uniqueness, no CHECK on status/musician_id. |
| New | (1) Data repair first, logged to `staffing_events`: any `confirmed` position with `musician_id IS NULL` → `vacant`; any second live offer on a chair → `superseded`; any `accepted` offer whose chair holder differs → `superseded`. (2) `CREATE UNIQUE INDEX contract_offers_one_live_per_position ON contract_offers(project_position_id) WHERE status IN ('pending','viewed') AND is_substitution = false`. (3) `CREATE UNIQUE INDEX contract_offers_one_accepted_per_position ON contract_offers(project_position_id) WHERE status = 'accepted'`. (4) `ALTER TABLE project_positions ADD CONSTRAINT confirmed_has_musician CHECK ((status = 'confirmed') = (musician_id IS NOT NULL))`. (5) `ALTER TABLE substitution_requests ALTER COLUMN status SET DEFAULT 'pending_approval'`. (6) Missing FK indexes: `services(project_id)`, `project_positions(project_id)`, `contract_offers(project_position_id)`, `projects(organization_id)`, `instruments(organization_id)`. |
| Migration path | Run the 12 probes from [C Appendix D](audit/C-offer-cascade-trace.md#appendix-d--sql-probes-to-size-these-risks-in-production-read-only) on production first. Ship the repair as a separate, reviewed script with a RESULTS query (the house convention). Then the constraints. Add `is_substitution BOOLEAN NOT NULL DEFAULT false` to `contract_offers`, backfilled from `substitution_requests.offer_id`. |
| Backward compatibility | The one-accepted index conflicts with the substitution flow, which writes the substitute's `accepted` before the original's `released` ([C §5.1](audit/C-offer-cascade-trace.md)). Either land PR 4 (the `claim_chair` RPC that releases then claims in one transaction) before this index, or add the index as `NOT VALID` first. Sequence below handles this. |
| Affected code | `respond.ts` (release-before-claim ordering), `substitutions/[id]/approve` (set `is_substitution`), `send-offer-dialog.tsx` (insert may now fail with 23505; surface it), `expire-offers`. |
| Test requirement | Stateful tests asserting a 23505 on the second live offer; a Postgres-backed test (see §6) proving the CHECK rejects a bad write. |
| Rollback risk | Low. Indexes and CHECK can be dropped. The repair is the risk; it must be logged row by row and reviewed before commit. |

### 3.2 `staffing_events` (migration 092)

| | |
|---|---|
| Reason | No actor or transition history. "Why did Mike get this job?" is unanswerable for direct assigns and book imports ([C §8](audit/C-offer-cascade-trace.md)). |
| New | `staffing_events(id, organization_id, actor_type, actor_id, entity_type, entity_id, action, before jsonb, after jsonb, created_at)`. Indexes on `(organization_id, created_at desc)`, `(entity_type, entity_id)`. RLS: admin SELECT, INSERT only via service role or a DEFINER function `log_staffing_event()`. No UPDATE/DELETE policy. |
| Migration path | Additive. |
| Backward compatibility | None needed. History starts at deploy. |
| Affected code | A `logEvent()` helper in `src/lib/staffing/events.ts`; calls added in `respond.ts`, assign, unassign, rescind, expire cron, sub approve/decline, send-email. Later the RPCs insert directly. |
| Test requirement | Each stateful route test asserts the event row. |
| Rollback risk | None. |

### 3.3 Offer columns (migration 093)

| | |
|---|---|
| Reason | Distinguish timed-out from replaced ([C §10.2 item 4](audit/C-offer-cascade-trace.md)); record who sent; make pay basis explicit ([C R-18](audit/C-offer-cascade-trace.md)); snapshot the services the musician agreed to ([C §6.1](audit/C-offer-cascade-trace.md)). |
| Old | status CHECK of 7 values; no actor; `custom_pay` ambiguous. |
| New | Add `'superseded'` to the CHECK. Add `created_by uuid null`, `pay_basis text null check in ('per_service','flat')`, `terms_snapshot jsonb null`, `delivery_status text null check in ('queued','sent','failed','suppressed')`. |
| Backward compatibility | All nullable. Readers treat `pay_basis null` as `per_service`, which is what payments generation does today. Existing `expired` rows are untouched; `superseded` is written only going forward. |
| Affected code | `src/types/database.ts`, `project-offers.tsx` status badges (render `superseded` and `released`, which today render nothing), `gig-page-client.tsx`, `payments/compute.ts`. |
| Test requirement | Identity test that `pay_basis null` produces today's amounts. |
| Rollback risk | Low. |

### 3.4 `position_services` (migration 094, behind `call_scoped_requirements`)

| | |
|---|---|
| Reason | The one real model change. Lets A1 work rehearsal + show while 8 hands work load-in only. |
| Old | None. `servicesFor(position) = project.services` implicitly in 7 readers ([C §6.1](audit/C-offer-cascade-trace.md)). |
| New | `position_services(project_position_id references project_positions on delete cascade, service_id references services on delete cascade, primary key (project_position_id, service_id))`. RLS via position → project. Trigger: both rows must belong to the same project. |
| Migration path | Additive. **No backfill.** Absence of rows means "all services", which reproduces every existing quartet assignment exactly. |
| Backward compatibility | Guaranteed by the "no rows = all" rule. Deleting a service cascades its scope rows; a position whose scope becomes empty reverts to all services, so the helper must treat "had scope rows, now none" as "no services" to avoid silently widening. Store an explicit `scope_mode text default 'all' check in ('all','selected')` on `project_positions` to make that unambiguous. |
| Affected code | New `src/lib/staffing/scope.ts: servicesFor(position, services)`. Adopt it in: `payments/generate` + `compute.ts`, `after-gig/rules.ts`, `schedule-conflict.ts` (already parameterized by services), `next-candidate.ts`, `send-email`, `gig/[token]/page.tsx`, `accept` confirmation email, `calendar`, `send-gig-details`, `staffing-alerts`, `pre-gig-reminders`, sub approval email. UI: a call picker on the position when the flag is on. |
| Test requirement | For every adopter, a test that `scope_mode='all'` yields today's output byte for byte; the production fixture (§7.2) exercises `selected`. |
| Rollback risk | Low for data. Medium for behaviour if an adopter is missed, which is why the flag exists and is off for every existing org. |

### 3.5 `requirements` (migration 095, behind `call_scoped_requirements`)

| | |
|---|---|
| Reason | "8 stagehands at load-in" without eight manual rows. |
| New | `requirements(id, project_id, instrument_id, quantity int check > 0, pay_basis, default_pay numeric null, notes, status text check in ('open','filled','cancelled'), created_by, timestamps)`; `project_positions.requirement_id uuid null references requirements`. A server route `POST /api/projects/[id]/requirements` creates the row and materializes `quantity` positions (chair numbers 1..N) with the same `position_services` scope. |
| Backward compatibility | Quartet UI never creates requirements. `requirement_id` stays null on every existing row. |
| Affected code | New route, new dialog (crew UI only), staffing-alerts groups by requirement when present. |
| Test requirement | Materialization idempotency; fulfilment count derived from positions. |
| Rollback risk | Low. |

### 3.6 `assignments` history (migration 096)

| | |
|---|---|
| Reason | The spec's Assignment entity; the record of how a seat was filled and why it ended. |
| New | `assignments(id, project_position_id, musician_id, source text check in ('offer','direct_assign','book_import','substitution','auto_populate'), offer_id uuid null, status text check in ('confirmed','withdrawn','cancelled','completed','replaced'), started_at, ended_at null, ended_reason text null, created_by uuid null)`. Partial unique `(project_position_id) WHERE ended_at IS NULL`. |
| Migration path | Backfill one `confirmed` row per currently confirmed position from `project_positions` + the accepted offer where one exists (source `offer`). Seats with no matching accepted offer get `source = NULL` and `backfilled = true`; the system cannot tell a direct assign from a book import after the fact and must not guess. Historical completed projects: backfill the same way, `status='completed'`. This is derivation, not reinterpretation, and is flagged as backfilled. `source` is therefore nullable, with a CHECK that it is non-null when `backfilled = false`. |
| Backward compatibility | Reads stay on `project_positions.musician_id`. The dual write happens inside `claim_chair`, assign, unassign, book import, sub transfer. |
| Affected code | `respond.ts`, assign, unassign, `import-from-book-dialog` (moves server-side in PR 5), `auto-populate`. |
| Test requirement | Every seat change produces exactly one open assignment row. An integrity check compares `assignments` open rows with `project_positions.musician_id`. |
| Rollback risk | Low. Table can be dropped. |

### 3.7 Organization flags and roles (migration 097)

| | |
|---|---|
| New | `organizations.call_scoped_requirements boolean not null default false`, `auto_cascade boolean not null default false`, `sms_offers boolean not null default false`, `credentials_enabled boolean not null default false`. Add all four plus `vertical` to the privileged-columns trigger (081) so an admin cannot flip behaviour via PostgREST. `organization_members.role` CHECK gains `coordinator`, `finance`. |
| Compatibility | Defaults off. `is_org_admin()` unchanged. `member`, `coordinator`, `finance` are read-only at the RLS layer until Phase 2 adds `has_org_permission()`. |

### 3.8 Vertical registry extension (migration 098 + code)

| | |
|---|---|
| New | Rewrite the `organizations_vertical_check` to add `production_crew`, `photo_video`, `staging`. In code, extend `VerticalTemplate` with `sessionTypes`, `sections`, `eventTypes`, `leadFallbackSkill`, `features.useLeaderFee`, `defaultWorkerPolicy`, `reportQuestions`, `offerTemplate`. Music templates get today's literal values so the identity test stays green. |
| Compatibility | `resolveVertical()` already fails open to the default. |

### 3.9 Tenant hardening (migration 099, can ship first)

| | |
|---|---|
| Reason | [B T-1](audit/B-domain-model-and-tenancy.md): the portal-era policy "Musicians can update own contact info" lets a linked musician rewrite `organization_id`. T-3/T-4/T-5 dead policies and functions. |
| New | Drop policies from 016/033/034/035/041 that key on `musicians.user_id` (the portal is gone); revoke EXECUTE on `activate_musician_by_token`, `get_musician_by_invite_token`; drop the `organizations` INSERT policy (018); add `is_org_admin` to the `impersonation_log` INSERT policy; `SET search_path = public` on every DEFINER function. |
| Compatibility | Verify first that no live path depends on `musicians.user_id` (the `auth/callback` redirect to `/musician` already 404s). |
| Test | Extend `rls-policy-safety.test.ts`; add Postgres-backed tenant tests (§6). |

### 3.10 FK policy changes (migration 100, later)

| | |
|---|---|
| Reason | Position delete and musician hard-delete cascade away offer history ([B §B.8](audit/B-domain-model-and-tenancy.md)). |
| New | `contract_offers.project_position_id` and `.musician_id` → `ON DELETE RESTRICT`; `substitution_requests` likewise. Position "delete" becomes `status='cancelled'` when offers exist; musician delete is already archived when payments exist. |
| Compatibility | The UI's delete paths move server-side in PR 5 and choose cancel vs delete. |

Not proposed: renaming any table or column, changing `chair_number`, changing `custom_pay` semantics, touching `payments`, touching the music-library tables.

---

## 4. Code architecture: the staffing domain module

Create `src/lib/staffing/` and move the cascade's business rules into it. Routes become thin. This is the "generic vocabulary internally" step (spec Stage B) and it wraps the seams [audit C §10.1](audit/C-offer-cascade-trace.md) found clean:

```
src/lib/staffing/
  types.ts        Requirement, Offer, Assignment, Candidate (TS views over existing rows)
  live.ts         isLiveOffer(offer, now): the one predicate (replaces 9 ad hoc checks)
  scope.ts        servicesFor(position, services): "no rows = all"
  rank.ts         pure ranking policy extracted from next-candidate.ts (sort, exclusions)
  candidates.ts   getNextCandidates (existing, moved; excludes expired/rescinded/released by default)
  conflicts.ts    schedule-conflict.ts (existing, moved; also sees offer-less seats)
  pay.ts          payments/compute.ts (existing) + computeOfferPay: single rule for email, gig page, calendar, payments
  offers.ts       createOffer (RPC create_offer), respond (RPC claim_chair / decline), rescind, expire, supersede
  seats.ts        assignDirect, releaseSeat(reason): the one "free the chair" function
  requirements.ts cancelPosition, createRequirement (materialize)
  projects.ts     cancelProject (retire offers, notify)
  substitutions.ts request / approve / decline / expire as one state machine
  cascade.ts      advance(position, trigger): manual: suggest; auto: suggest + createOffer; idempotent on (position, trigger offer)
  events.ts       logEvent()
  notify.ts       notify(event, ctx): fan-out to email now, SMS later; always logs
```

Two RPCs carry the atomicity:

- `claim_chair(p_offer_id)`: in one transaction, verify the offer is live and the project active, release the original's accepted offer if this is a substitution, set the offer `accepted`, set the position `confirmed` + `musician_id`, close the prior `assignments` row and open a new one, insert `staffing_events`. Returns `claimed | already_responded | position_filled | project_inactive`. Replaces `claimChairForAccept`'s two updates and its unguarded revert.
- `create_offer(p_position_id, p_musician_id, p_expires_at, p_custom_pay, p_pay_basis, p_personal_message, p_created_by, p_supersede boolean)`: verify same org, position not confirmed/cancelled, musician active, no live offer for this musician on the project; supersede siblings when asked; insert; set position `offered`; snapshot services; log. The unique index is the backstop.

The browser dialogs call `POST /api/positions/[id]/offers` which calls `createOffer()`. The 7-day/48h/4h expiry defaults and the supersede behaviour become one code path instead of three.

Auto cascade (`cascade.ts`) is the product promise the code does not have today. It is a *policy* on top of the hardened primitives, flag-gated, off for every existing org. It is intentionally last in Phase 2 so that it cannot ship on top of an unguarded `vacateChair`.

---

## 5. Vertical configuration (no branching)

Extend `VerticalTemplate` and consume it. Everything below is a label or a list; none of it is a code path.

| Addition | Music value (frozen by identity test) | production_crew value |
|---|---|---|
| `terms.gig`, `terms.sub`, `terms.offer`, `terms.lead`, `terms.section`, `terms.position`, `terms.callTime` | Gig, Substitute, Call, Lead, Section, Position, Call time | Show, Cover, Offer, Crew chief, Department, Slot, Call time |
| `sessionTypes` | rehearsal, performance, dress_rehearsal, sectional, other | load_in, rehearsal, show_call, breakout, strike, other |
| `sections` | strings, woodwinds, brass, percussion, other | audio, lighting, video, staging, rigging, management, labor, other |
| `eventTypes` | Ceremony, Cocktail Hour, Reception, … | Corporate, Conference, Concert, Festival, Gala, … |
| `features.useLeaderFee` | true | false (hides the $50 field, defaults null) |
| `leadFallbackSkill` | "Violin 1" | null (always needs-pick) |
| `defaultWorkerPolicy` | today's orchestra text | crew conduct text |
| `reportQuestions` | includes "arrangements" | includes "load-in/strike issues" |
| `offerTemplate` | `contract-offer` with Ensemble line | `contract-offer` with Call sheet summary block (call time, room, dress, pay basis) |
| Position presets | String Quartet etc. (gated, today ungated) | Three-call show from the branch |

Rebase the `overhire-demo-skin` branch's template, seed, brand and demo script onto master; renumber its migration; drop its direct `load_in`/`strike` writes in favour of `sessionTypes`.

The 8 admin/cron sends that pass `organizationId = undefined` get the org id. The ~224 literals in API error strings are low priority: fix those that reach a user (CSV headers, subject fallbacks `'Orchestra'`/`'Instrument'`).

---

## 6. Test strategy

Today no test touches Postgres and about 25 of 60 files assert on source text ([audit A §11](audit/A-architecture-and-infrastructure.md)). The rearchitecture needs three layers:

1. **Stateful route tests** with the existing `MockSupabaseDb` (keep; cheap; already catch races). Extend to the uncovered scenarios: S7b decline into held chair, S13 viewed overwrite, S8 cancelled project accept, S9 position delete with live offer, S10 deactivated musician accept, S11 two sub requests, S14 two live offers, send failure after supersede, double cron run, candidate re-suggestion after expiry.
2. **Postgres-backed tests** (new): a `supabase start` or `postgres:16` service in CI, replay `supabase/migrations/*.sql`, then run (a) RLS tenant tests as two users in two orgs across every table, (b) constraint tests for the partial unique indexes and CHECK, (c) RPC tests for `claim_chair` and `create_offer` with real concurrency (two connections). Mark with a vitest project `db` so `npm test` stays network-free by default.
3. **End-to-end domain fixtures** (new, run against the mock DB and the Postgres project): the quartet fixture (§7.1) and the production fixture (§7.2), written as scripts of domain calls, asserting final state, emails sent (captured), events logged and payments generated.

Retire source-text tests only when a behavioural test replaces them.

### 7.1 Quartet regression fixture ("do not break the business")

Project *Wedding*, services Ceremony + Cocktail Hour, positions Violin 1, Violin 2, Viola, Cello, each with a ranked list of three. Steps: create project, services, positions; send initial offers; V1 accepts; V2 declines → admin sends next → accepts; Viola expires via cron → admin sends next → accepts; Cello accepts; gig details sent and confirmed; pre-gig reminder drafted and approved; Viola requests a sub for Ceremony → approved → sub accepts → original released; payments generated (per service, leader fee on V1 only); project completes; pay summary sent; 1099 aggregation unchanged. Assert identical emails (snapshot), identical `payments` rows, and that with `call_scoped_requirements=false` nothing in the output mentions calls.

### 7.2 Production fixture

Event *Acme Leadership Meeting*, calls Load-in 07:00–11:00, Rehearsal 15:00–17:00, Show 18:00–21:00, Strike 21:00–23:30. Requirements: TD (rehearsal+show), A1 (all four), A2 (show), L1 (all four), Playback (rehearsal+show), Stagehand ×8 (load-in), Stagehand ×4 (strike). Assert: materialization yields 17 positions; one worker can hold Stagehand load-in and Stagehand strike without conflict; `findConflicts` on the scoped services does not flag A2 against a morning booking elsewhere; cascades per position are independent; each worker's gig page lists only their calls; pay = per-call base for scoped calls; moving the Show call updates only affected workers' snapshots and notifies them; a call-sheet document targeted at `service=Strike` is visible to the four strike hands only; no email contains "chair", "instrument" or "ensemble".

---

## 8. Implementation sequence (PR-sized steps)

Each PR is independently testable and shippable. Migrations are listed where they apply; every migration PR carries a RESULTS query per the house convention and the PR template checkbox. "Flag" means the behaviour is dark for existing orgs until the org column is flipped.

### Phase 0: audit (this PR)

| PR | Content | Risk |
|---|---|---|
| 0 | `docs/architecture/*` (this document set). No code. | none |

### Phase 1: safety net

| PR | Content | Tests | DB | Risk |
|---|---|---|---|---|
| 1 | **Integrity probes.** `scripts/integrity-checks.sql` (the 12 probes from audit C Appendix D plus: pending offers on inactive musicians, assignments/positions drift, positions without scope when flag on, orphan `position_services`). A `scripts/integrity-checks.js` runner that prints OK / ACTION NEEDED. Run against production and paste results into the PR. | script smoke test | read-only | none |
| 2 | **Cascade characterization tests.** Stateful tests for every uncovered scenario in §6 item 1, written to document *current* behaviour (including the unsafe cases, marked `it.fails`/`todo`). The quartet fixture (§7.1) against `MockSupabaseDb`. No production code changes. | +15 files | none | none |
| 3 | **One-line guards.** `vacateChair` guarded by `musician_id IS NULL` (R-2); gig page `viewed` write guarded by `status='pending'` (R-3); expire cron vacate guarded (R-4); `getNextCandidates` excludes expired/rescinded/released on this chair (R-6); staffing-alerts threshold uses the tightest match (A R7); sub-offer expiry moves the request to `sub_declined` and notifies (R-7); accept/decline routes reject when `projects.status` not in (draft, active) or musician inactive (R-5 partial, R-9). Flip the PR 2 `it.fails` tests to passing. | existing + PR 2 | none | low, each is a guard that only narrows writes |
| 4 | **Tenant hardening.** Migration 099 (§3.9). Extend `rls-policy-safety.test.ts`. Live-DB verification that no `musicians.user_id` paths remain. | SRC + db | 099 | low |
| 5 | **Postgres in CI.** vitest `db` project, migration replay, first RLS tenant tests (two orgs, every table), first constraint tests. Also adopt `supabase/migrations` tracking via the CLI's `schema_migrations` so "merged" and "applied" stop differing (process change documented in the runbook; hand-apply stays allowed but is recorded). Delete or clearly label `supabase/schema.sql`. | new `db` project | none | none |

### Phase 2: core generalization (behind the same UI)

| PR | Content | Tests | DB | Risk |
|---|---|---|---|---|
| 6 | **`staffing_events` + `logEvent()`.** Migration 092. Writers added to every existing transition. | stateful tests assert events | 092 | none |
| 7 | **`src/lib/staffing/` module.** Move `respond.ts`, `next-candidate.ts`, `schedule-conflict.ts`, `payments/compute.ts` behind the module with re-exports so imports do not break. Add `isLiveOffer()` and replace the 9 ad hoc checks. Add `releaseSeat(reason)` and replace the 4 vacate writers. Add `computeOfferPay()` and make email, gig page, calendar and payments use it (fixes the three leader rules; R-18). | identity tests: same outputs | none | medium (touches money display); mitigated by snapshot tests on the quartet fixture |
| 8 | **Server-side offer creation.** `POST /api/positions/[id]/offers` → `createOffer()`. Both dialogs call it. Supersede moves out of `send-email` into `createOffer`. One expiry policy. `created_by` recorded. Migration 093 (offer columns). `superseded` and `released` rendered on the gig page and offers list. | stateful tests for the route, including send failure | 093 | medium (UI path change); flag-free because behaviour is identical for a successful send |
| 9 | **`claim_chair` and `create_offer` RPCs.** Migration 091 constraints land here, after the RPC orders release-before-claim. Data repair script reviewed and run first. `respond.ts` delegates to the RPC. | db project: concurrency tests with two connections | 091 | medium; the repair is the risky part and is a separate reviewed script |
| 10 | **Lifecycle routes.** `cancelProject`, `cancelPosition`, deactivate musician, book import and template materialization move server-side; each retires live offers, releases seats, cancels open sub requests, notifies, logs. Position `cancelled` status. Migration 100 (RESTRICT FKs). Dialogs call the routes. | stateful + db | 100 | medium (removes browser writes); RLS write policies for positions/offers can then be narrowed to admins-via-API |
| 11 | **`assignments` history.** Migration 096 with backfill. Dual write inside the RPCs and routes. Integrity check compares with positions. | db | 096 | low |
| 12 | **Terminology completion.** New term keys; 8 admin sends get `organizationId`; gate presets, leader-fee field, "Can Lead (Violin 1)", conduct copy, default policy, after-gig lead fallback, service/section/event type lists via the extended `VerticalTemplate`. Identity test extended with the new default values. | identity + registry | none | low |
| 13 | **Organization flags.** Migration 097. `useFlags()` provider mirroring `VerticalProvider`. Flags added to trigger 081. | SRC + db | 097 | none |

### Phase 3: call-scoped requirements

| PR | Content | Tests | DB | Risk |
|---|---|---|---|---|
| 14 | **`position_services` + `servicesFor()`.** Migration 094. Helper adopted by every reader listed in §3.4, each with an identity test for `scope_mode='all'`. No UI yet. | identity per adopter | 094 | medium; mitigated by flag + identity tests |
| 15 | **Scope UI + offer content.** Call picker on positions when the flag is on; offer email, gig page, calendar and confirmation list scoped services; `terms_snapshot` written; change-propagation (service time change → notify affected workers, log). | fixture §7.2 partial | none | low (flag) |
| 16 | **`requirements` with quantity.** Migration 095, route, crew dialog, staffing alerts by requirement. | fixture §7.2 | 095 | low (flag) |
| 17 | **Scope-aware substitution.** Honour `substitution_requests.service_id`: an approved per-service sub creates a child position scoped to that service and transfers only it. Off when the flag is off (today's whole-chair behaviour). | stateful | none | medium |
| 18 | **Auto cascade.** `cascade.ts` `advance()` called from decline, expire, supersede when `auto_cascade` is on. Idempotency key on `(position_id, trigger_offer_id)`. Stop conditions and admin notification when the list is exhausted. | stateful + db | none | medium; dark by default |
| 19 | **Production fixture end to end** (§7.2) passing in CI; quartet fixture still byte-identical. | both fixtures | none | none |

### Phase 4: production vertical

| PR | Content |
|---|---|
| 20 | Rebase `overhire-demo-skin`: `production_crew` template with the §5 values, seed, brand, demo seed script, three-call show preset. Migration 098. `photo_video` and `staging` templates as configuration only. |
| 21 | Crew-facing call sheet: `project_file_targets` (migration), per-call gig-details send, read receipts per call; music path untouched. |

### Phase 5: communications

| PR | Content |
|---|---|
| 22 | `notify(event, ctx)` layer; every send goes through it; `email_logs` gains `channel`, `failed_at`, `failure_reason`; failed sends logged; `delivery_status` on offers; bounced addresses skipped with an admin warning. |
| 23 | SMS provider interface + Twilio adapter behind `sms_offers`; consent and STOP handling; `musician_notification_preferences` replaced by `worker_channel_preferences` (per channel, per message class); inbound YES/NO mapped to accept/decline through the same RPCs. Email keeps working with the flag off. |

### Phase 6: credentials and availability

| PR | Content |
|---|---|
| 24 | `credential_types`, `worker_credentials`, expiry cron (reuse `cron.ts`), W-9-style upload tokens; candidate warnings only, never a hard filter by default. |
| 25 | `availability_requests` / `availability_responses`, token response page (reuse the confirm-token pattern), feed into `findConflicts` as soft signals. |

### Phase 7 and 8

Worker-visible payment states as a presentation mapping over `payments` (no schema change). Vendor organizations designed as a separate entity only after Phase 3 and 4 have real customers.

---

## 9. Feature flags

| Flag | Scope | Gates | Default for existing orgs |
|---|---|---|---|
| `organizations.call_scoped_requirements` | org | `position_services` UI and readers honouring scope; `requirements` | off |
| `organizations.auto_cascade` | org (later per requirement) | `cascade.advance()` sending offers | off |
| `organizations.sms_offers` | org | SMS channel in `notify()` | off |
| `organizations.credentials_enabled` | org | credential UI and candidate warnings | off |
| `organizations.vertical` | org | vocabulary, lists, presets, offer template | `music_contractor` |
| `CRON_ENABLED`, `EMAIL_SAFE_MODE` | global | unchanged | unchanged |

All org flags are added to the privileged-columns trigger so only the service role can flip them. Enable first on a development org seeded from the production fixture.

---

## 10. Observability and integrity

- Structured log line (JSON) in every staffing operation and cron item: `org`, `project`, `position`, `offer`, `musician`, `job`, `action`, `outcome`. Start in `logEvent()` and `runCronJob()`.
- `cron_runs` table (job, started_at, finished_at, items, failures) written by `runCronJob()`, with an alert when a job has not succeeded within 2× its interval. Fixes the "no run ledger" gap ([A R8](audit/A-architecture-and-infrastructure.md)).
- Per-item send failures raise an ops alert when the failure ratio exceeds a threshold, instead of returning silently in a 200.
- Integrity checks (PR 1) run nightly via a cron after Phase 1 and before/after every migration PR.

---

## 11. Rollback and risk summary

| Change | Rollback | Residual risk |
|---|---|---|
| Guards (PR 3) | revert code | none; guards only narrow writes |
| Constraints (PR 9) | drop indexes/CHECK | the data repair; mitigated by probe → script → review → RESULTS |
| RPCs (PR 9) | `respond.ts` keeps the old path behind an env switch for one release | dual code paths for one release |
| Server-side creation (PR 8, 10) | re-enable browser writes (RLS policies kept until Phase 3) | none |
| `position_services` (PR 14) | flag off; table can stay | missed adopter when flag on; identity tests per adopter |
| `assignments` (PR 11) | drop table | none while reads stay on positions |
| Vertical extension (PR 12, 20) | revert code | identity test guards the quartet wording |

The largest risk is not technical. It is the hand-applied migration process with no tracking and a laptop backup. PR 5 (migration tracking, Postgres in CI) and a real backup path (Supabase PITR or a scheduled dump to R2 with a restore script) should land before PR 9 changes constraints on production data.

---

## 12. What this proposal does not do

- Rename `musicians`, `instruments`, `chair_number`, `books` or any RPC.
- Split `project_positions` into two tables.
- Change `custom_pay` semantics or any `payments` row.
- Touch the music library (repertoire, intakes, Spotify, book builder). It stays a music-only module behind `intake_enabled`.
- Build vendors, CRM, ticketing, inventory, payroll or a marketplace.
- Turn on any new staffing semantics for an existing quartet organization.
