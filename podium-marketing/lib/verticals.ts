/**
 * Single source of truth for Podium's performing-arts verticals.
 *
 * Drives the "Who it's for" nav dropdown, the footer, the homepage art-form
 * section, and the six /for/[vertical] SEO landing pages (one dynamic template).
 * Copy is intentionally specific per art form — the whole point of the revamp is
 * that each audience hears its own language, not generic "team management."
 *
 * Integrity note: pullQuote is Podium's own positioning statement, NOT a
 * fabricated customer testimonial. Market figures are from public sources
 * (League of American Orchestras, OPERA America, Dance/USA).
 */

export type VerticalIcon =
  | "orchestra"
  | "choir"
  | "theatre"
  | "dance"
  | "church"
  | "agency";

export interface Vertical {
  slug: string;
  /** Full display name, e.g. on the landing hero */
  name: string;
  /** Short label for nav/footer/cards */
  navLabel: string;
  /** One-line card blurb on the homepage grid */
  blurb: string;
  icon: VerticalIcon;
  /** Jewel-tone accent theming (applied via CSS custom properties) */
  accent: string;
  accentSoft: string;
  accentGlow: string;
  /** SEO */
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  /** Hero */
  eyebrow: string;
  headline: string;
  headlineEm: string;
  subhead: string;
  /** The words this audience actually uses (ties to the app's vertical templates) */
  vocab: { person: string; work: string; session: string };
  /** That art form's specific pain points */
  pains: { title: string; body: string }[];
  /** Benefit-framed capabilities in this art form's language */
  capabilities: { title: string; body: string }[];
  /** Who, specifically, within this art form */
  audience: string[];
  /** Honest positioning pull-quote (NOT a fabricated testimonial) */
  pullQuote: string;
  /** Real customer testimonial for this art form, if we have one */
  testimonial?: { quote: string; name: string; org?: string };
  /** FAQ — also emitted as FAQ schema for SEO */
  faqs: { q: string; a: string }[];
}

export const VERTICALS: Vertical[] = [
  {
    slug: "orchestras",
    name: "Orchestras & Bands",
    navLabel: "Orchestras & Bands",
    blurb: "Fill every chair and call subs in the right order — without the phone tree.",
    icon: "orchestra",
    accent: "#A9791F",
    accentSoft: "#F6EDDC",
    accentGlow: "rgba(200,150,80,0.22)",
    metaTitle: "Orchestra Personnel & Substitute Management Software",
    metaDescription:
      "Podium is the affordable way for community, regional, and youth orchestras to staff services, call substitutes in order, and track per-service pay — enterprise workflow without the enterprise price.",
    keywords: [
      "orchestra personnel software",
      "orchestra management software",
      "substitute musician management",
      "orchestra staffing software",
      "personnel manager software",
      "community orchestra software",
    ],
    eyebrow: "For Orchestras & Bands",
    headline: "Fill every chair.",
    headlineEm: "Skip the phone tree.",
    subhead:
      "From the first service to the last stand, Podium sends offers, cascades to the next player when someone passes, and keeps a clean record of who was called — so you fill the section in minutes, not a lost weekend.",
    vocab: { person: "musicians", work: "concerts", session: "services" },
    pains: [
      {
        title: "The sub scramble",
        body: "A player drops two days out and you're working down a paper list by text and phone, hoping someone says yes before the downbeat.",
      },
      {
        title: "No record of the call",
        body: "Who did you offer first? Who declined? When there's no trail, the fairness of your list is only as good as your memory — and players notice.",
      },
      {
        title: "Priced out of the big tools",
        body: "OPAS and the enterprise suites are built for million-dollar symphonies. You need that workflow at a community-orchestra budget.",
      },
    ],
    capabilities: [
      {
        title: "Offers that cascade in order",
        body: "Set your call order by chair. When someone declines or times out, the next player is offered automatically — the section fills while you sleep.",
      },
      {
        title: "A hiring record you can stand behind",
        body: "Every offer, decline, and acceptance is logged with a timestamp. When the music director asks who you called, you have the answer.",
      },
      {
        title: "Per-service pay, W-9s, and 1099s",
        body: "Track base pay and leader fees per service, collect W-9s, and export at tax time — no second spreadsheet.",
      },
      {
        title: "Chairs, sections, and seating that make sense",
        body: "Build your instrumentation by section and chair, save go-to rosters, and see confirmed, pending, and open seats at a glance.",
      },
    ],
    audience: [
      "Community & regional orchestras",
      "Youth & training orchestras",
      "Concert bands & wind ensembles",
      "Per-service pickup orchestras",
      "Ballet & opera pit contractors",
    ],
    pullQuote:
      "The call should take minutes and leave a record — not a weekend and a paper list.",
    testimonial: {
      quote:
        "Staffing a full program used to take me most of an afternoon between emails, texts, and updating the spreadsheet. With Podium, I sent the entire call in under 15 minutes and could immediately see which chairs were filled.",
      name: "Rebecca C.",
      org: "Subito Strings",
    },
    faqs: [
      {
        q: "Does Podium handle substitute calling in seniority or rotation order?",
        a: "Yes. You set the call order per chair, and offers advance down your list automatically when a player declines or a hold expires — with a full audit trail of who was contacted and when.",
      },
      {
        q: "Is this affordable for a community or regional orchestra?",
        a: "Podium is a fraction of the enterprise orchestra suites. It's priced for per-service budgets, not seven-figure symphonies — and there's a free plan to start.",
      },
      {
        q: "Can musicians accept offers from their phone?",
        a: "Yes. Players get a link to accept, decline, or request a sub in one tap — no app to install, no login required.",
      },
    ],
  },
  {
    slug: "choirs",
    name: "Choirs & Choral Societies",
    navLabel: "Choirs & Choruses",
    blurb: "Schedule singers, section leaders, and paid ringers — volunteers and pros together.",
    icon: "choir",
    accent: "#9B2D3A",
    accentSoft: "#F8E9E9",
    accentGlow: "rgba(180,70,85,0.20)",
    metaTitle: "Choir & Chorus Scheduling Software for Paid Singers",
    metaDescription:
      "Podium schedules choirs and choral societies by voice part — volunteers and paid section leaders and ringers together — with offers, availability, and pay tracking in one place.",
    keywords: [
      "choir scheduling software",
      "chorus management software",
      "section leader scheduling",
      "paid singer management",
      "choral society software",
      "church choir software",
    ],
    eyebrow: "For Choirs & Choral Societies",
    headline: "Every voice part covered.",
    headlineEm: "Ringers and all.",
    subhead:
      "Schedule your volunteer singers and your paid section leaders and ringers side by side — send offers by voice part, collect availability before you commit, and keep pay and W-9s straight.",
    vocab: { person: "singers", work: "concerts", session: "sessions" },
    pains: [
      {
        title: "Volunteers and pros in two systems",
        body: "Your members live in one tool and your paid ringers in a pile of texts and invoices. Nothing shows you the whole ensemble at once.",
      },
      {
        title: "Section leaders are paid — but nothing tracks it",
        body: "You owe section leaders and subs real money, but volunteer-scheduling apps have no concept of rates, W-9s, or 1099s.",
      },
      {
        title: "Chasing availability by reply-all",
        body: "\"Who can sing the Messiah run?\" turns into forty replies and a spreadsheet you rebuild every season.",
      },
    ],
    capabilities: [
      {
        title: "One roster, volunteers and paid",
        body: "See your whole choir by voice part — members, section leaders, and ringers — and staff any concert from the same place.",
      },
      {
        title: "Availability before you commit",
        body: "Poll singers for a concert or a season, then send firm offers only to those who are free. No more guessing.",
      },
      {
        title: "Pay your section leaders properly",
        body: "Track rates for paid singers, collect W-9s, send pay confirmations, and export at tax time — built in, not bolted on.",
      },
      {
        title: "Offers singers actually answer",
        body: "One tap to accept or decline from any phone, plus a personal portal with their schedule and music.",
      },
    ],
    audience: [
      "Symphony & oratorio choruses",
      "Professional chamber choirs",
      "Choral societies & community choirs",
      "Church & cathedral choirs with paid staff",
      "Festival & project choruses",
    ],
    pullQuote:
      "Volunteers and paid ringers belong in one place — organized by voice part, not by which app remembers them.",
    testimonial: {
      quote:
        "We schedule volunteer singers, paid section leaders, instrumentalists, and substitutes in the same production. Podium lets us manage all of them together without forcing everyone into the same kind of role or pay structure.",
      name: "Matthew C.",
    },
    faqs: [
      {
        q: "Can Podium handle both volunteer and paid singers?",
        a: "Yes — that's the point. Volunteers, section leaders, and paid ringers all live on one roster by voice part, and only the paid ones carry rates, W-9s, and 1099 tracking.",
      },
      {
        q: "How is this different from Planning Center or a volunteer scheduler?",
        a: "Volunteer tools only poll members — they don't hire. Podium sends paid offers, tracks rates and W-9s, and handles substitutes, which is exactly what choirs with paid staff need.",
      },
      {
        q: "Can we collect availability before booking?",
        a: "Yes. Poll singers for a concert or a whole season first, then send firm offers to whoever's free.",
      },
    ],
  },
  {
    slug: "theatre",
    name: "Theatre Companies",
    navLabel: "Theatre",
    blurb: "Staff cast, crew, and pit across a run — understudies and swings included.",
    icon: "theatre",
    accent: "#BC3B2C",
    accentSoft: "#FBE9E4",
    accentGlow: "rgba(200,80,60,0.20)",
    metaTitle: "Theatre Company Staffing & Personnel Software",
    metaDescription:
      "Podium staffs cast, crew, and pit across a production run — send offers, manage understudies and swings, and track contractor pay and W-9s in one place.",
    keywords: [
      "theatre company software",
      "production staffing software",
      "cast and crew scheduling",
      "pit orchestra contracting",
      "understudy management",
      "theatre personnel software",
    ],
    eyebrow: "For Theatre Companies",
    headline: "Cast, crew, and pit —",
    headlineEm: "call complete.",
    subhead:
      "Staff a whole production run in one place: send offers for roles and crew calls, keep understudies and swings a tap away, and track everyone's pay and paperwork through closing night.",
    vocab: { person: "cast & crew", work: "productions", session: "calls" },
    pains: [
      {
        title: "A run is a hundred calls",
        body: "Eight shows a week, rehearsals, put-ins, brush-ups — and someone has to confirm who's on for every single call.",
      },
      {
        title: "Understudy and swing chaos",
        body: "When a lead goes out, you need the cover confirmed and everyone notified now — not after a round of frantic texts.",
      },
      {
        title: "1099 people, W-2 tools",
        body: "Your contractors need offers, rates, and W-9s — not an HR system built for salaried employees.",
      },
    ],
    capabilities: [
      {
        title: "Staff the whole run at once",
        body: "Build the production, add every rehearsal and performance call, and send offers for roles and crew positions in one pass.",
      },
      {
        title: "Understudies and swings on standby",
        body: "Keep covers a tap away and send a fresh offer the moment someone goes out — with a record of who was called.",
      },
      {
        title: "Pit and music staff, handled",
        body: "Contract the pit by chair, manage per-chair sub lists, and track doubling and per-service pay alongside the cast.",
      },
      {
        title: "Pay and paperwork through closing",
        body: "Track contractor rates, collect W-9s, send pay confirmations, and export for 1099s when the run wraps.",
      },
    ],
    audience: [
      "Regional & professional theatres",
      "Musical theatre companies",
      "Opera & light-opera companies",
      "Summer stock & festivals",
      "School & college productions",
    ],
    pullQuote:
      "A production is a hundred calls a week. Every one of them should confirm itself.",
    faqs: [
      {
        q: "Can Podium handle a full performance run, not just one date?",
        a: "Yes. A production holds every rehearsal and performance call, and you staff all of them from one place — with each performer accepting their calls in a tap.",
      },
      {
        q: "Does it manage understudies and swings?",
        a: "Yes. Keep covers on standby and send a new offer instantly when someone goes out, with a full record of who was contacted.",
      },
      {
        q: "Can we contract the pit orchestra too?",
        a: "Absolutely — staff the pit by chair, keep per-chair sub lists, and track doubling and per-service pay alongside your cast and crew.",
      },
    ],
  },
  {
    slug: "dance",
    name: "Dance & Ballet Companies",
    navLabel: "Dance & Ballet",
    blurb: "Cast dancers and musicians across a production — and re-cast in minutes.",
    icon: "dance",
    accent: "#7E4A78",
    accentSoft: "#F3EAF2",
    accentGlow: "rgba(150,95,155,0.20)",
    metaTitle: "Dance & Ballet Company Personnel Software",
    metaDescription:
      "Podium helps dance and ballet companies cast dancers and contract pit musicians across a production — manage A/B casts, re-cast injuries fast, and track pay and paperwork.",
    keywords: [
      "dance company software",
      "ballet company management",
      "dancer casting software",
      "dance personnel software",
      "ballet pit orchestra contracting",
    ],
    eyebrow: "For Dance & Ballet Companies",
    headline: "Cast the season.",
    headlineEm: "Re-cast in minutes.",
    subhead:
      "Manage dancers and the musicians who play for them across a whole production — cast performances, keep covers ready for the inevitable injury, and track everyone's pay in one place.",
    vocab: { person: "dancers", work: "productions", session: "calls" },
    pains: [
      {
        title: "Casting lives on a whiteboard",
        body: "A/B casts, covers, and understudies for a dozen performances — mapped in a spreadsheet only you can read.",
      },
      {
        title: "Injuries don't wait",
        body: "When a dancer goes out, you need the cover set and everyone told immediately — mid-week, mid-run, no delay.",
      },
      {
        title: "Guest artists and pit, off to the side",
        body: "Guest dancers and the pit orchestra get contracted in a separate pile of emails from your company roster.",
      },
    ],
    capabilities: [
      {
        title: "Cast every performance",
        body: "Assign roles across the run, manage A/B casts and covers, and see who's on for each performance at a glance.",
      },
      {
        title: "Re-cast the moment you need to",
        body: "Send a cover their call in a tap when an injury hits, and keep a clean record of the change.",
      },
      {
        title: "Company, guests, and pit together",
        body: "Contract guest artists and the pit orchestra from the same place you manage your company dancers.",
      },
      {
        title: "Pay and paperwork in one place",
        body: "Track rates for guests and musicians, collect W-9s, and export at tax time.",
      },
    ],
    audience: [
      "Ballet & contemporary companies",
      "Regional & civic dance companies",
      "Dance festivals & intensives",
      "Companies contracting a live pit orchestra",
      "Guest-artist–heavy productions",
    ],
    pullQuote:
      "Injuries don't wait for a reply-all. The cover should be set before the barre is cold.",
    faqs: [
      {
        q: "Can Podium handle A/B casting across a run?",
        a: "Yes. Assign roles for each performance, manage multiple casts and covers, and see the full picture of who's dancing when.",
      },
      {
        q: "Does it help with last-minute injury replacements?",
        a: "Yes — send a cover their call in a tap and notify everyone instantly, with a record of the change.",
      },
      {
        q: "Can we contract the pit orchestra here too?",
        a: "Yes. The musicians who play for you live alongside your dancers, contracted and paid from the same place.",
      },
    ],
  },
  {
    slug: "churches",
    name: "Churches & Worship",
    navLabel: "Churches & Worship",
    blurb: "Schedule worship teams and paid musicians for every service — week after week.",
    icon: "church",
    accent: "#B5701E",
    accentSoft: "#FBEEDF",
    accentGlow: "rgba(200,130,60,0.20)",
    metaTitle: "Church Worship Team & Paid Musician Scheduling",
    metaDescription:
      "Podium schedules worship teams and paid musicians for weekly services — volunteers and paid section leaders, subs, and sub organists together, with rates, W-9s, and 1099s built in.",
    keywords: [
      "church musician scheduling",
      "worship team scheduling software",
      "paid church musician software",
      "sub organist scheduling",
      "section leader church",
      "worship planning paid musicians",
    ],
    eyebrow: "For Churches & Worship",
    headline: "Every service covered.",
    headlineEm: "Paid players included.",
    subhead:
      "Schedule your worship team and your paid musicians for the weekly rhythm of services — volunteers, section leaders, and sub organists together — with rates and W-9s handled, not hidden in a shoebox.",
    vocab: { person: "team members", work: "services", session: "services" },
    pains: [
      {
        title: "Volunteer tools can't pay anyone",
        body: "Your scheduling app is built for volunteers, but your section leaders, subs, and holiday players are paid — and it has no idea.",
      },
      {
        title: "The paid musicians live in a shoebox",
        body: "Rates, W-9s, and who-played-Christmas-Eve live in a folder of emails and a checkbook, not your scheduling system.",
      },
      {
        title: "Filling a Sunday at the last minute",
        body: "Your organist is out Sunday and you're texting subs one at a time, hoping to fill it before the prelude.",
      },
    ],
    capabilities: [
      {
        title: "Volunteers and paid players together",
        body: "Schedule your whole worship team in one place — and treat paid musicians like the professionals they are, with rates and paperwork.",
      },
      {
        title: "The weekly rhythm, handled",
        body: "Build recurring services, send offers for the seats you pay for, and cascade to a sub when someone can't make it.",
      },
      {
        title: "Rates, W-9s, and 1099s built in",
        body: "Track what you owe each paid musician, collect W-9s, and export at tax time — no shoebox, no scramble.",
      },
      {
        title: "Sub organists and ringers on call",
        body: "Keep a ranked list of subs and fill an open Sunday in a tap instead of a text thread.",
      },
    ],
    audience: [
      "Liturgical churches with paid sections",
      "Cathedrals & large parishes",
      "Churches hiring holiday & festival players",
      "Music ministries with paid staff",
      "Synagogues & temples with paid musicians",
    ],
    pullQuote:
      "Your paid musicians aren't volunteers. Your software shouldn't treat them like a shoebox of receipts.",
    faqs: [
      {
        q: "We already use Planning Center for volunteers. Why Podium?",
        a: "Volunteer schedulers don't hire or pay anyone. Podium is for the paid side — section leaders, sub organists, holiday players — with offers, rates, W-9s, and 1099s. Many churches run both.",
      },
      {
        q: "Can it handle recurring weekly services?",
        a: "Yes. Build your service rhythm, send offers for the paid seats, and fill a gap with a ranked sub list when someone's out.",
      },
      {
        q: "Does it track what we owe paid musicians?",
        a: "Yes — rates per service, W-9s on file, pay confirmations, and a clean 1099 export at year end.",
      },
    ],
  },
  {
    slug: "agencies",
    name: "Entertainment Agencies",
    navLabel: "Event & Entertainment Agencies",
    blurb: "Book performers onto events fast — offers out, confirmations in, done.",
    icon: "agency",
    accent: "#1F7A70",
    accentSoft: "#E4F2F0",
    accentGlow: "rgba(40,150,140,0.18)",
    metaTitle: "Entertainment & Event Agency Booking Software",
    metaDescription:
      "Podium helps entertainment and event agencies book performers onto weddings, parties, and corporate events — fast offer cascades, confirmations, and 1099 pay tracking in one place.",
    keywords: [
      "entertainment agency software",
      "event booking software",
      "performer booking software",
      "wedding band booking software",
      "talent booking software",
      "gig booking agency software",
    ],
    eyebrow: "For Event & Entertainment Agencies",
    headline: "Book the event.",
    headlineEm: "Confirm it fast.",
    subhead:
      "Send offers to your performers, watch confirmations land, and fill an event before the client asks twice — with rosters, offers, and 1099 pay tracking in one place instead of five inboxes.",
    vocab: { person: "performers", work: "events", session: "sets" },
    pains: [
      {
        title: "Booking is a five-inbox sprint",
        body: "A client books Saturday and you're texting performers one by one, tracking yeses across email, phone, and memory.",
      },
      {
        title: "No single view of who's confirmed",
        body: "Half your acts replied, half didn't, and you can't tell the client the lineup is set because you're not sure it is.",
      },
      {
        title: "Paying 1099 talent is its own mess",
        body: "Rates, W-9s, and who-got-paid-for-which-event scatter across spreadsheets and payment apps.",
      },
    ],
    capabilities: [
      {
        title: "Offers out, confirmations in",
        body: "Send offers to your performers and watch acceptances land in real time — cascade to the next act when someone passes.",
      },
      {
        title: "One view of every event",
        body: "See exactly who's confirmed, pending, or open for each event, so you can tell the client the lineup is locked.",
      },
      {
        title: "Your roster, by skill and act",
        body: "Organize performers by what they do — vocalists, DJs, MCs, specialty acts — and find the right fit for each booking fast.",
      },
      {
        title: "1099 pay, tracked",
        body: "Track rates, collect W-9s, send pay confirmations, and export for 1099s — one system instead of five.",
      },
    ],
    audience: [
      "Wedding & event band agencies",
      "Entertainment & talent agencies",
      "Corporate & private-event bookers",
      "Multi-act variety agencies",
      "DJ & specialty-act companies",
    ],
    pullQuote:
      "The client asked once. The lineup should already be confirming itself.",
    faqs: [
      {
        q: "Can Podium send offers to multiple performers at once?",
        a: "Yes — send offers across your roster and watch confirmations land in real time, cascading to the next performer when someone passes.",
      },
      {
        q: "Does it track 1099 pay for our talent?",
        a: "Yes. Rates, W-9s, pay confirmations, and 1099 export are built in — no separate spreadsheet or payment-app archaeology.",
      },
      {
        q: "Can we organize performers by what they do?",
        a: "Yes. Tag and group performers by skill and act type — vocalists, DJs, MCs, specialty acts — and staff each event from the right pool.",
      },
    ],
  },
];

export function getVertical(slug: string): Vertical | undefined {
  return VERTICALS.find((v) => v.slug === slug);
}

export const VERTICAL_SLUGS = VERTICALS.map((v) => v.slug);
