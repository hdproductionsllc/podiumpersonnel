# Podium V2.0 Strategy — Findings & Recommendation

*Researched 2026-07-11 (Claude Fable 5). Three research streams: full codebase product audit, performing-arts market research, and pivot-market research. Sources cited inline.*

---

## TL;DR

**Expand, don't pivot — but expand on a re-architected core that keeps the pivot option alive.**

V2.0 = extract Podium's generic engine (roster → project → services → positions → offers → payments) from its music-specific overlay (instruments/chairs/sections), make the domain layer configurable, and go after **all performing-arts ensembles** — where research found a real, underserved, paying market (~2,200 US orchestras, ~170 opera companies, 250+ dance companies, festivals, and churches with *paid* musicians, with proven willingness to pay $300–$15,000/year). The same re-architecture makes the strongest pivot candidate (SMB AV/production crew booking) a Phase-3 second brand on the same engine, not a bet-the-company rewrite.

---

## 1. What Podium actually is (from the code audit)

Strip the labels and Podium is **an offer-based crewing system for skilled 1099 contractors staffed onto dated events**:

- **Generic spine (domain-agnostic):** organizations → members, roster (people, skills, tags, service area/distance), projects → services (dated, venue, pay), positions, offers (token accept/decline, expiry, reminders, rescind/release), substitution/backfill workflow, payments (W-9, 1099 export, Zelle), files/gig-details distribution with confirmations, full email audit log, self-service worker portal, multi-tenant RLS.
- **Music-specific overlay (well-contained):** the `instruments` taxonomy with sections and sort order, `chair_number` as rank, `leader_fee`, `src/lib/orchestra-positions.ts` (Concertmaster/Principal title inference), `src/lib/ensemble-detection.ts` (String Quartet/Piano Trio fingerprints), 64-instrument auto-seed per org.

**This separation is the whole strategic story.** The spine transfers to any skilled-freelancer market; only the overlay is music. Genericization difficulty: moderate — the overlay needs to become a configurable "role taxonomy + rank + title rules" layer.

Other audit facts that matter:
- Billing is built but **switched off** (`NEXT_PUBLIC_BILLING_ENABLED` unset → everyone gets Pro free). Implemented model is a single flat **$29/mo Pro** tier; the strategy doc's 3-tier model was never built.
- 26 email templates, 6 crons, ~70 API routes, 9 test suites on the risky paths. Known debt: crons run UTC not org-timezone, storage bucket scoped to "logged in" not org, no in-app musician merge, root-dir clutter.

## 2. Path A — Expand to all performing-arts ensembles (RECOMMENDED)

### The market is real and the timing is good
- **2,218 US orchestras** identified by IRS filings (League of American Orchestras, 2024); ~350–400 professional, the rest regional/community — **per-service, freelance-heavy, exactly where sub-calling pain is worst and OPAS is unaffordable.**
- ~170 professional opera companies (OPERA America), 250+ dance companies (Dance/USA) — pit orchestras are hired per-production, contractor-style.
- Churches with **paid** musicians (section leaders, ringers, sub organists): completely unserved. Planning Center (90,000+ churches) schedules volunteers and structurally won't touch money/rates/W-9/1099. Churches literally use diocesan PDF sub lists today.
- Proven willingness to pay: OPAS $2K–$15K+/yr (budget-scaled), Rhapsody from ~$100/mo + $500 onboarding, Planning Center $180–$2,900/yr, Chorus Connection $300+/yr.

### Competitive landscape (four tiers)
| Tier | Players | Verdict |
|---|---|---|
| Enterprise ops suites | OPAS, ArtsVision, DIESE | Database-of-record for big institutions; **no automated offer cascades**; too expensive below the professional tier |
| Direct cascade competitors | **Rhapsody** (~$100/mo+$500, at League 2024 tech fair), **Ensemble Manager** (auto-advancing priority-list cascade), **StageSub** (EU, SMS cascades) | The real threat. All young, small, single-segment. None entrenched. |
| Church/community | Planning Center, Chorus Connection, Muzodo | Internal members/volunteers only — no paid-freelancer hiring. Podium's church wedge is clean. |
| Adjacent | Cadenza (auditions), The Sub Pool (directory, ~$59/yr musicians) | Complementary, not competitive |

### What moving up-market requires (union/CBA modeling)
AFM collective bargaining agreements create concrete data-model requirements — and DIESE already *markets* "union agreement compliance," proving it's a purchase criterion:
- Per-service wage scales, distinct rehearsal vs. performance rates
- **Doubling premiums** (+20% first double, +10% each additional — Local 802 scales), principal premiums, cartage, overtime
- **Pension (AFM-EPF) and health-fund contributions** as % of scale wages — payroll must compute employer contributions
- **Configurable call order**: strict rank / rotation / seniority, with an **auditable hiring ledger** (freelancers publicly complain about opaque lists and favoritism — an audit trail is a feature musicians and unions would welcome)
- Broadway/theater model: per-chair approved-sub lists (chairholder names up to 5 subs, conductor approves)

### Why this path wins
David's distribution, credibility, and domain knowledge are all in this world. The product is already 80% built for it. The competitors are beatable-small. The unserved segments (community/regional orchestras, churches with paid musicians, opera/ballet pits, festivals) sit exactly at Podium's contractor-first, affordable positioning — below OPAS's price floor and outside Planning Center's volunteer model.

## 3. Path B — Pivot markets (researched, ranked)

Meta-finding: **the offer cascade is a commodity in hourly-shift markets and a differentiator only in skilled, project-based, 1099 markets.**

| Market | Verdict | Why |
|---|---|---|
| **SMB AV/production crew booking** | ⭐ Best pivot/second vertical | 1:1 engine map (roles/certs = instruments, multi-day shows = services, cascade + backfill = how crews are booked). Verified gap: LASSO is quote-only enterprise (~$10M rev); Rentman/Flex/Current RMS force you to buy inventory software to get crewing; CrewBrain is German-centric. **No lightweight crew-only offer tool for US shops with 5–50 freelancers at $99–299/mo.** Same live-event GTM network as music. |
| Multi-op DJ/photo-booth/wedding vendors | Good #2 | Tens of thousands of buyers already paying $30–140/mo (HoneyBook, Check Cherry, DJEP); incumbents do assignment, not offers ("HoneyBook breaks when you hire a second shooter"). Lower ACV, more marketing volume needed. |
| Entertainment/band agencies | Contested | Back On Stage already does gig-offer cascades at $49–149/mo. Real competitor at our exact price point. |
| Interpreter agencies | Lifestyle niche | Near feature-for-feature match, but Boostlingo (PE-backed) consolidated the market. |
| Referee/officials assigning | Low-ACV grind | Same model, but Arbiter has exclusive NFHS deal through 2028; contested segment is a 3-way fight at $300–700/yr ACV. |
| Event staffing (catering/hospitality) | **Avoid** | Offer/accept is table stakes; Nowsta at $3–4/user/mo; $300M+ of VC in incumbents; Quickstaff Pro owns the simple low end at $49/mo. |
| Healthcare per-diem/locums | **Avoid (solo)** | Big money, but 12+ month compliance build (Joint Commission HCSS cert, license verification), tightening state laws, $1.4B-funded marketplaces. |
| Church scheduling head-on | **Avoid** | Planning Center already ships decline-triggered auto-reoffers, free tier, 90k churches. (Paid-musician sliver = Path A, not a pivot.) |
| Court reporting / tutoring | **Avoid** | Shrinking (ASR) / dispatch isn't the buying trigger. |

### Why not pivot outright
A pivot abandons: a live product, comped founding customers, music-world distribution and credibility, and a domain moat (union rules, orchestral titles) that competitors must re-learn — to enter markets where David has zero network. The pivot targets are good but not *so much better* than the performing-arts expansion that starting GTM from scratch makes sense for a solo founder one month after launch. The scarce asset is distribution, and David's is in music.

## 4. V2.0 — the concrete plan

### Architecture (the foundation that serves both paths)
1. **Configurable role taxonomy.** Replace hard-coded instruments/sections with org-level "role templates": Orchestra (current 64-instrument seed), Choir (SATB + section leaders), Theater Pit, Dance, Worship Band, Big Band, Festival Crew. `chair_number` generalizes to `rank`. Same tables, configurable seed + labels.
2. **Pluggable title/formation rules.** `orchestra-positions.ts` and `ensemble-detection.ts` become per-template rule sets instead of hard-coded libraries.
3. Keep the generic spine untouched — it's already right.

### Features (ranked by strategic value)
1. **Call-order engine v2**: rotation and seniority modes alongside strict rank; **auditable hiring ledger** visible to admins (and optionally musicians). This is the union-friendly differentiator no competitor markets.
2. **SMS offers/reminders** (Twilio). StageSub and Ensemble Manager both have SMS; sub-calling is a speed game.
3. **Availability-first workflow**: poll availability across a season/production before sending offers (what Muzodo does for free — absorb it).
4. **Union pay modeling** (up-market unlock, can be V2.1): per-service scales, doubling/principal premiums, cartage, pension/health % calculations in the payments export.
5. **Season/production layer**: group projects into a season; per-production instrumentation carried across services (how orchestras/opera actually think).
6. **Broadway-style approved-sub lists** per chair (V2.x, theater segment).
7. Debt paydown: org-timezone crons, org-scoped storage bucket, in-app musician merge, README.

### Pricing (turn billing ON with new tiers)
$29 flat is drastically underpriced against Rhapsody ($1,200/yr + $500 setup) and the vertical's budget-scaled norm:
- **Ensemble — $29/mo**: current feature set, roster ≤ 50 (churches, chamber groups, small choirs)
- **Orchestra — $99/mo**: unlimited roster, SMS, call-order engines, availability polling, seasons
- **Institution — $249/mo**: union pay modeling, hiring-ledger reports, multi-ensemble orgs, priority support
Founding orgs stay comped (already promised).

### Go-to-market
- League of American Orchestras conference tech fair (Rhapsody was there in 2024 — be there too), Orchestra Personnel Management Intensive
- Church music directors (ACDA, AGO for organists) — the "paid church musicians" wedge has zero competition
- Content: "how to run a sub list that musicians trust" (the transparency/audit angle resonates — freelancers are publicly angry about opaque call lists)

### Phase 3 (only after Path A revenue): second vertical
Re-skin the engine as a crew-booking product for SMB AV/production shops (separate brand, "Crew" template on the same core, $99–299/mo). The V2.0 role-taxonomy work makes this a template + marketing-site exercise, not a rewrite. Decision point: revisit when Podium MRR proves the engine, or if the performing-arts expansion stalls.

## 5. Open decisions for David
1. Approve the expand-don't-pivot direction (or pick a pivot lane).
2. Pricing tiers — comfortable with $99/$249 up-market tiers?
3. Sequencing: billing-on + repricing first, or role-taxonomy re-architecture first?
4. Brand: does "Podium Personnel" stretch to choirs/dance/theater? (It reads orchestral — probably an asset for Path A.)

## 6. Source highlights
- League of American Orchestras: americanorchestras.org/orchestras-at-a-glance-2024
- Rhapsody: rhapsody.la · Ensemble Manager: ensemblemanager.com · StageSub: stagesub.com
- OPAS pricing: fineartssoftware.com · DIESE: diesesoftware.com (markets "union agreement compliance")
- Planning Center: planningcenter.com/pricing; auto-reschedule blog post (2024)
- Local 802 single-engagement classical scales (doubling premiums); Hartford Symphony AFM Master Agreement
- "Fixing the Call" (harpsichord-hotsauce.com) — freelancer demand for transparent call lists
- LASSO revenue ~$9.7M (getlatka.com); Rentman crew pricing (rentman.io/pricing/crew); CrewBrain (crewbrain.com)
- Back On Stage (backonstageapp.com) — existing cascade competitor for band agencies
