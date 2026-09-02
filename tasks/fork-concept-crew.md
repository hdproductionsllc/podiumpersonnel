# Fork concept: a crew-booking brand for small live-event production shops

*Researched 2026-09-01. Three streams: competitor and market-size research, adjacent-market comparison, and voice-of-customer from ~20 Reddit threads (r/livesound, r/stagehands, r/techtheatre, r/EventProduction). Sources inline. This is a concept for a decision, not a build plan.*

## The one-paragraph concept

A second brand on the Podium engine for US production companies, AV rental shops, and staging companies that book 5 to 50 freelance technicians per show. The owner builds a show (load-in, show day, strike), lists the calls (A1, A2, L1, V1, four hands), and hits send. The first-choice tech for each slot gets a text and email with the gig, hours, pay, and address in the first message. One tap confirms and the date lands on their calendar. A decline or silence rolls to the next person on the owner's list. The owner watches a board of who is confirmed, who is pending, and who is next. Call sheets go out with read receipts. W-9s are collected at first booking, payment status is visible to the tech, and January's 1099s are one export. Flat monthly price, no per-confirmation meter.

Working name: **Overhire** (the industry word for extra crew called in per show). Not checked for trademark or domain.

## Why this market, in customers' own words

The five most repeated pains, by frequency across the threads:

1. **Booked blind.** "Are you available?" with no "gig, hours and pay." The top-voted reply in a 55-comment thread: "I ask 'at what time? and what's the gig/position and pay?' Put it all in one message." (r/livesound, 2021-11-25). "I've done waaaaay too many gigs where I had almost no information other than call time and location." (+108, 2023-04-07)
2. **Chasing payment.** "It took 60 days of constant harassment to finally get paid." (r/stagehands, 2026-08-14). A 45-comment thread naming companies that "currently owe me money" (2026-01-13).
3. **Availability ping-pong.** Owners "track schedules of people that aren't my employees." Techs refuse to "submit my avails" without "a guaranteed date in the calendar." A tech being forced onto a venue's availability app got 178 upvotes for "If they want first right access to my time on short notice they can pay for the privilege." (2024-09-08)
4. **Info in a thousand places.** "Sends information in email, in text, over the phone, over email, in Lasso, and a lot of times information is conflicting." (new owner, 2025-04-23). "We had to make a new group chat every single day as crew switched in and out." (2025-04-17)
5. **Shift tools don't fit gigs.** On When I Work: "if you want to crew a concert and you need a1, a2, v1, l1 etc, you have to make the first shift and then copy… when there's a change, you have to change each person's shifts." On Deputy: "multiple shows for one tech in a day was a pain." (2019-04-10)

Every one of these is something Podium already does for quartets. Pain 1 is the offer email. Pain 3 is the cascade. Pain 4 is gig details with confirmations. Pain 5 is positions on dated services. Pain 2 is the payments and 1099 layer, which no competitor in the price band has.

## The competitive truth (this is narrower than the July research assumed)

| Product | Price | Cascade? | 1099/W-9? | Notes |
|---|---|---|---|---|
| **CrewDriver** (Vancouver) | $35/mo min + ~$3 per confirmation; $2 at $500/mo | **Yes.** "Offer to 3 specific people, then move onto the bigger list," auto-advances | No | The real competitor. SMS-first. Thin US presence; Capterra page 404. crewdriverapp.com |
| Crew-Call | Free (5) / $49 (25) / $149 (100) / $299 | No, assignment offers only | No | Cheapest US crew-only tool. crew-call.net |
| CrewBrain (Germany) | $35 / $59 / $85 flat | Not documented | No | EU payroll focus |
| Rentman Crew (EU) | €39 + €14–24 per power user | No, availability requests + invites, manual re-ask | No | Rental suite origin |
| LASSO | Unpublished, per person working per month, sales call | No, AI "ranked shortlist," manual invites | Yes via embedded payroll | Enterprise. "A lot of training required." |
| Flex StaffingPlus | +$100/mo on a $510/mo base | No | No | Requires Flex |
| Mertzcrew | Markup on labor | No, marketplace | Yes, they contract the techs | Outsourcing, not software |

**The gap:** a US-native, crew-only, cascade-first tool at a flat $99 to $199 with W-9 capture and payment visibility. CrewDriver has the cascade but meters it per confirmation, which punishes a busy month. Everyone else in the price band is a notification board.

## Market size, honestly

| Proxy | Number | Source |
|---|---|---|
| US AV equipment rental businesses | 2,469, avg 18.8 employees | IBISWorld 2025 |
| Trade show and conference planning companies | 47,753 | IBISWorld 2025 |
| AVIXA members | 11,400+ | avixa.org |
| EACA (exhibit installers) member companies | 330+ | eaca.com |
| Freelance AV pool (Mertzcrew alone) | 14,000+ | mertzcrew.com |

Realistic addressable: a few thousand US shops that hire non-union freelancers directly, which means corporate meetings in small hotel rooms, weddings, churches, community events, and right-to-work trade show floors. Chicago, NYC, SF, and Vegas convention venues are union hall territory and are out. At $150 average, 300 customers is $540K a year. That is a good solo business, not a rocket.

## How the Podium engine maps

| Podium today | Crew brand |
|---|---|
| Musician, instrument, chair | Tech, role (A1, A2, L1, V1, LED tech, rigger, hand), seniority (lead vs hand) |
| Project with dated services | Show with calls: load-in, show day(s), strike |
| Positions, ranked offer cascade | The call list, sent in the owner's order |
| Gig details with confirmations | Call sheet with read receipts |
| Music and parts distribution | Show docs: plots, stage plots, run of show |
| Substitution and backfill | Drop-out coverage |
| W-9, payments, 1099 export | The "chasing payment" fix |
| Verticals registry | A 40-line template plus a role seed list |

## What has to be built that music never needed

1. **SMS offers and reminders.** Techs live in text. CrewDriver is SMS-first. Twilio plus US 10DLC registration, which takes two to four weeks of paperwork. Start this first.
2. **Per-call headcounts.** A show needs eight hands at load-in, three operators for the show, eight hands at strike. Today positions belong to the project and a booked person gets every service. Positions need to attach to a call, or a call group. This is the one real data-model change.
3. **The call message.** The offer must carry date, call time, address, pay, gig type, duration, and dress code in the first message. That is the list techs themselves wrote. Mostly template work.
4. **Certifications with expiry** on the roster: forklift, aerial lift, OSHA 10, rigging. Tags with dates.
5. **Payment status the tech can see.** "Submitted, approved, paid on" in the portal. Pain 2 is the loudest freelancer complaint and no cheap competitor touches it.
6. **Availability polling.** "A good PM will send out a text mid month with the next month's schedule." Already on the V2 list.
7. A brand: domain, name, signup that picks the vertical, marketing site.

Rough build: six to eight weeks solo with Claude, with SMS and per-call positions being most of it. Everything else is nouns.

## Pricing

Flat, unlimited shows and confirmations:

| Tier | Crew on roster | Price |
|---|---|---|
| Shop | up to 25 | $99/mo |
| Company | up to 75 | $199/mo |
| Multi-site | unlimited | $299/mo |

Anchors: CrewDriver at 60 confirmations a month is about $215. Crew-Call is $49 to $299 with no cascade. Rentman at three power users is about $110. Flat pricing is the positioning: "we don't charge you for being busy."

## Go to market

- **Your adjacency.** Every venue where your quartets play has an AV company loading in the same morning. Venue coordinators know which AV shops are small and scrappy. Start there.
- **Engineering as marketing.** A free "crew call generator" that turns a show into the one-message call the techs asked for. Captures the owner's email, shows the product's core idea before signup.
- **Where the buyers are.** ILEA chapters, AVIXA, EACA and ExhibitorLive for the I&D segment, r/livesound (answer questions, do not pitch), the Delegate Wranglers Facebook group for corporate producers.
- **Timing.** Buying windows are the slow months before season: December to January and July to August. Season peaks are spring and fall.

## Risks

- CrewDriver adds flat US pricing. They could. Speed matters.
- You have no direct network here. The wedding-vendor world touches it but is not it.
- A second brand doubles support surface. The September hardening pass is the precondition, not optional.
- SMS compliance. 10DLC registration is slow and picky; a rejected campaign stalls the whole thing.
- The per-call positions change touches the offer engine, the most tested and most important code in the repo. It needs its own test pass.

## The gate before building anything

Five conversations. Owners or crew coordinators of shops with 5 to 50 freelancers who hire non-union directly. Ask them to show you how they booked last week's show, on their phone, right there. Then ask three things: what broke in the last three months, would you pay $99 a month flat for it never to break that way again, and can I text you when I have something to look at.

Three of five yes: build it, SMS first. Two or fewer: keep the research, do not build, and revisit in a year.

## The cheaper side bet (not a fork)

The adjacent-market research found the cascade is completely absent among multi-operator wedding vendors: DJ companies, photo studios with associate shooters, photo-booth operators, bridal hair and makeup agencies. Check Cherry ($29 to $139) stops at first-come-first-served "claim." DJ Event Planner stops at assign. Those buyers already pay $350 to $1,700 a year for staffing they hand-run, and they are your people. That is not a new brand. It is the existing `event_agency` template with DJ and photographer nouns, and you could test it next month by inviting three vendor friends. Lower value per customer, but zero build and zero new network.

## Sources

Competitors: lasso.io/pricing, lasso.io/faqs, crewdriverapp.com/call-out-management-systems, rentman.io/pricing/crew, flexrentalsolutions.com/flex-staffingplus, current-rms.com/pricing, crewbrain.com/en/pricing, crew-call.net/pricing, mertzcrew.com, capterra.com/p/229153/LASSO. Market size: ibisworld.com (AV equipment rental; trade show and conference planning), avixa.org/membership, eaca.com. Union boundary: avlaborsourceinc.com Las Vegas guide 2026-08-12, iatse320.org orientation PDF, eaca.com jurisdiction guide. Adjacent markets: checkcherry.com/pricing, djeventplanner.com/employee-tools.php, planningcenter.com changelog 2024-08-20 (auto-reschedule declined requests), assignr.com/pricing, capterra.com/p/172778/Nowsta. Voice of customer: reddit.com/r/livesound threads r1lr9a, 12e7e6h, 1cs5p34, 1fc5zdz, 1k1kdd7, 1k5yccn, bbpp6r, 1heqmag, y19tsa; r/stagehands 1qbzszc, 1voassa, 1swi92b; r/techtheatre 1vnobm0; r/EventProduction 1riacxp. Unverified: SetHero and Wrapbook pricing (secondary sources), Nowsta pricing (conflicting listings), the "15 freelancers" tipping point (not found anywhere).
