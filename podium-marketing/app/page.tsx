"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  ChevronRight,
  Users,
  Send,
  LayoutGrid,
  Wallet,
  Check,
  ArrowRight,
} from "lucide-react";
import { VERTICALS } from "@/lib/verticals";
import { VerticalIcon } from "@/components/VerticalIcon";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

export default function HomePage() {
  return (
    <>
      {/* ============================ HERO ============================ */}
      <section className="relative overflow-hidden bg-cream-100 pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="pointer-events-none absolute inset-0 bg-spotlight opacity-70" aria-hidden />
        <div className="pointer-events-none absolute -top-24 right-0 h-[36rem] w-[36rem] rounded-full bg-gradient-radial from-brass-200/40 to-transparent blur-2xl" aria-hidden />

        <div className="container-marketing relative">
          <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-8 items-center">
            <motion.div initial="hidden" animate="show" variants={stagger}>
              <motion.div variants={fadeUp}>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/70 border border-brass-200/70 px-4 py-1.5 text-sm font-body text-ink-600 backdrop-blur-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brass-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-brass-500" />
                  </span>
                  For every performing-arts organization
                </span>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="mt-6 font-display font-semibold text-ink-900 text-[2.75rem] leading-[1.05] sm:text-6xl lg:text-display-lg tracking-tight"
              >
                Stop chasing performers.
                <br />
                <span className="italic text-gradient-brass">Start making the art.</span>
              </motion.h1>

              <motion.div variants={fadeUp} className="mt-6 flex items-center gap-4">
                <span className="decorative-line" />
                <p className="max-w-xl font-body text-lg text-ink-500 leading-relaxed">
                  Podium is the modern way to staff every rehearsal and performance —
                  build your roster, send offers people answer from their phone, fill
                  the gaps automatically, and track pay. One platform, every discipline.
                </p>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-9 flex flex-col sm:flex-row gap-4">
                <Link href="https://app.podiumpersonnel.com/signup" className="btn-accent group text-base">
                  Start Free Trial
                  <ChevronRight className="ml-1 w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link href="#art-forms" className="btn-secondary text-base">
                  Built for your art form
                </Link>
              </motion.div>

              <motion.p variants={fadeUp} className="mt-6 font-body text-sm text-ink-400">
                14-day free trial · No credit card required · Set up in 5 minutes
              </motion.p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <HeroMockup />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===================== BUILT FOR YOUR ART FORM ===================== */}
      <section id="art-forms" className="relative section-padding bg-white">
        <div className="container-marketing">
          <SectionHeading
            eyebrow="One platform, every discipline"
            title="Built for your art form"
            subtitle="Podium speaks your language — chairs and sections, roles and covers, voice parts and worship teams. Choose your world and see how it fits."
          />

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {VERTICALS.map((v) => (
              <motion.div key={v.slug} variants={fadeUp}>
                <Link
                  href={`/for/${v.slug}`}
                  className="group block h-full rounded-2xl border border-cream-300/60 bg-cream-50 p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-transparent"
                  style={{ ["--accent" as string]: v.accent }}
                >
                  <span
                    className="inline-flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105"
                    style={{ backgroundColor: v.accentSoft, color: v.accent }}
                  >
                    <VerticalIcon name={v.icon} className="h-6 w-6" strokeWidth={1.6} />
                  </span>
                  <h3 className="mt-5 font-display text-xl font-semibold text-ink-800">{v.name}</h3>
                  <p className="mt-2 font-body text-sm text-ink-500 leading-relaxed">{v.blurb}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 font-body text-sm font-medium accent-text">
                    Explore
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ============================ PAIN ============================ */}
      <section className="section-padding bg-cream-100">
        <div className="container-marketing">
          <SectionHeading
            eyebrow="Sound familiar?"
            title="Staffing shouldn't be a second full-time job"
            subtitle="However you make it, the admin looks the same — and it eats the hours you'd rather spend on the work itself."
          />
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="mt-14 grid md:grid-cols-2 gap-5"
          >
            {PAINS.map((p) => (
              <motion.div key={p.title} variants={fadeUp} className="card">
                <h3 className="font-display text-xl font-semibold text-ink-800">{p.title}</h3>
                <p className="mt-3 font-body text-ink-500 leading-relaxed">{p.body}</p>
              </motion.div>
            ))}
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-10 text-center font-display text-2xl italic text-brass-600"
          >
            There&apos;s a better way.
          </motion.p>
        </div>
      </section>

      {/* ============================ SOLUTION ============================ */}
      <section className="section-padding bg-white">
        <div className="container-marketing">
          <SectionHeading
            eyebrow="One place for everything"
            title="From first offer to final payment"
            subtitle="Podium handles the details of staffing so you can keep your attention on the performance."
          />
          <div className="mt-16 space-y-16 lg:space-y-24">
            {SOLUTIONS.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className={`grid lg:grid-cols-2 gap-10 lg:gap-16 items-center ${
                  i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
                }`}
              >
                <div>
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brass-100 text-brass-600">
                    <s.icon className="h-6 w-6" strokeWidth={1.6} />
                  </span>
                  <h3 className="mt-5 font-display text-2xl md:text-3xl font-semibold text-ink-800">{s.title}</h3>
                  <p className="mt-4 font-body text-lg text-ink-500 leading-relaxed">{s.body}</p>
                  <ul className="mt-6 space-y-3">
                    {s.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-3 font-body text-ink-600">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-brass-500" strokeWidth={2.5} />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border border-cream-300/60 bg-cream-50 p-2 shadow-sm">
                  <div className="rounded-xl bg-white p-6 shadow-inner">{s.visual}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== NO-ACCOUNT ACCESS ===================== */}
      <section className="spotlight-stage section-padding text-cream-100">
        <div className="container-marketing relative grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="eyebrow !text-brass-400 before:!bg-brass-400/60">No accounts, no passwords</span>
            <h2 className="mt-5 font-display text-3xl md:text-display-md font-semibold text-cream-50 tracking-tight">
              Stop chasing people for answers
            </h2>
            <p className="mt-5 font-body text-lg text-cream-300 leading-relaxed max-w-xl">
              Your performers never create an account or manage a password. Offers,
              schedules, parts, and W-9s all arrive as links in their email that just
              work — so there is nothing for them to sign up for, and nothing for you
              to reset, explain, or chase.
            </p>
            <ul className="mt-8 grid sm:grid-cols-2 gap-x-8 gap-y-4">
              {NO_ACCOUNT_POINTS.map((pt) => (
                <li key={pt} className="flex items-start gap-3 font-body text-cream-200">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-brass-400" strokeWidth={2.5} />
                  {pt}
                </li>
              ))}
            </ul>
            <Link
              href="/features"
              className="mt-9 inline-flex items-center gap-2 font-body font-medium text-brass-300 hover:text-brass-200 transition-colors"
            >
              See how it works
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <PhoneMockup />
        </div>
      </section>

      {/* ============================ PROOF (honest) ============================ */}
      <section className="section-padding bg-white">
        <div className="container-marketing">
          <SectionHeading
            eyebrow="Built for the whole field"
            title="The performing arts run on freelancers"
            subtitle="Podium is built for the thousands of organizations that hire per performance — not the handful that can afford six-figure enterprise software."
          />
          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-6">
            {MARKET_STATS.map((m) => (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-center"
              >
                <div className="font-display text-4xl md:text-5xl font-semibold text-gradient-brass">{m.value}</div>
                <div className="mt-2 font-body text-sm text-ink-500">{m.label}</div>
              </motion.div>
            ))}
          </div>
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="mt-16 grid md:grid-cols-3 gap-5"
          >
            {TESTIMONIALS.map((t) => (
              <motion.figure
                key={t.name}
                variants={fadeUp}
                className="flex flex-col rounded-2xl border border-cream-300/60 bg-cream-50 p-7"
              >
                <div className="text-brass-400 font-display text-4xl leading-none">&ldquo;</div>
                <blockquote className="mt-2 flex-1 font-body text-ink-600 leading-relaxed">
                  {t.quote}
                </blockquote>
                <figcaption className="mt-5 border-t border-cream-300/70 pt-4 font-body text-sm">
                  <span className="font-semibold text-ink-800">{t.name}</span>
                  {t.org && <span className="text-ink-400"> · {t.org}</span>}
                </figcaption>
              </motion.figure>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ============================ PRICING PREVIEW ============================ */}
      <section className="section-padding bg-cream-100">
        <div className="container-marketing">
          <SectionHeading
            eyebrow="Simple pricing"
            title="Start free. Grow into it."
            subtitle="Performers are always free. Every new account gets a 14-day trial of a paid plan — no credit card required."
          />
          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRICING_TIERS.map((t) => (
              <div
                key={t.name}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  t.popular ? "border-brass-300 bg-white shadow-xl ring-2 ring-brass-300" : "border-cream-300/60 bg-cream-50"
                }`}
              >
                {t.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brass-500 px-3 py-1 text-[11px] font-body font-semibold uppercase tracking-wider text-white">
                    Most popular
                  </span>
                )}
                <h3 className="font-display text-xl font-semibold text-ink-800">{t.name}</h3>
                <div className="mt-3 font-display text-3xl font-semibold text-ink-900">
                  {t.price}
                  {t.price !== "$0" && <span className="text-base font-body text-ink-400">/mo</span>}
                </div>
                <p className="mt-2 font-body text-sm text-ink-500 leading-snug">{t.tagline}</p>
                <p className="mt-4 font-body text-sm text-ink-600">{t.headline}</p>
                <Link
                  href="https://app.podiumpersonnel.com/signup"
                  className={`mt-6 w-full justify-center ${t.popular ? "btn-accent" : "btn-secondary"}`}
                >
                  {t.price === "$0" ? "Start free" : "Start trial"}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center font-body text-sm text-ink-400">
            <Link href="/pricing" className="text-brass-600 hover:text-brass-700 underline underline-offset-4">Compare all plans in detail →</Link>
          </p>
        </div>
      </section>

      {/* ============================ FINAL CTA ============================ */}
      <section className="spotlight-stage section-padding text-center text-cream-100">
        <div className="container-marketing relative">
          <span className="eyebrow !text-brass-400 before:!bg-brass-400/60 justify-center">Ready when you are</span>
          <h2 className="mx-auto mt-5 max-w-2xl font-display text-3xl md:text-display-md font-semibold text-cream-50 tracking-tight">
            Get your time back
          </h2>
          <p className="mx-auto mt-5 max-w-xl font-body text-lg text-cream-300 leading-relaxed">
            Start your 14-day free trial. No credit card required. Set up in under five minutes.
          </p>
          <div className="mt-9 flex justify-center">
            <Link href="https://app.podiumpersonnel.com/signup" className="btn-accent group text-base">
              Start Free Trial
              <ChevronRight className="ml-1 w-5 h-5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {["Bank-level security", "Cancel anytime", "5-minute setup"].map((b) => (
              <span key={b} className="glass-badge text-sm text-cream-300">
                <Check className="h-3.5 w-3.5 text-brass-400" strokeWidth={2.5} />
                {b}
              </span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------ helpers ------------------------------ */

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="mx-auto max-w-2xl text-center"
    >
      <span className="eyebrow justify-center">{eyebrow}</span>
      <h2 className="mt-4 font-display text-3xl md:text-display-md font-semibold text-ink-800 tracking-tight text-balance">
        {title}
      </h2>
      {subtitle && <p className="mt-4 font-body text-lg text-ink-500 leading-relaxed text-balance">{subtitle}</p>}
    </motion.div>
  );
}

function HeroMockup() {
  return (
    <div className="relative">
      <div className="rounded-2xl border border-cream-300/70 bg-white shadow-2xl shadow-ink-900/10 overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-cream-200 bg-cream-100 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-burgundy-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-brass-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
        </div>
        <div className="flex">
          <div className="hidden sm:block w-36 shrink-0 bg-curtain-800 p-3">
            {["Dashboard", "Projects", "Roster", "Offers", "Payments", "Venues"].map((n, i) => (
              <div
                key={n}
                className={`rounded-md px-2.5 py-2 text-[11px] font-body ${
                  i === 3 ? "bg-brass-500/20 text-brass-300" : "text-cream-400"
                }`}
              >
                {n}
              </div>
            ))}
          </div>
          <div className="flex-1 p-4">
            <div className="grid grid-cols-3 gap-2">
              {[["Active", "6"], ["Roster", "38"], ["Confirmed", "22"]].map(([l, v]) => (
                <div key={l} className="rounded-lg border border-cream-200 p-2.5">
                  <div className="text-[10px] font-body uppercase tracking-wide text-ink-300">{l}</div>
                  <div className="font-display text-xl font-semibold text-ink-800">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {[
                ["Priya N.", "Principal Cello", "Accepted", "text-green-600 bg-green-50"],
                ["Marcus T.", "Lead Vocalist", "Pending", "text-amber-600 bg-amber-50"],
                ["Devon R.", "Stage Manager", "Viewed", "text-blue-600 bg-blue-50"],
              ].map(([name, role, status, cls]) => (
                <div key={name} className="flex items-center justify-between rounded-lg border border-cream-200 px-3 py-2">
                  <div>
                    <div className="text-xs font-body font-medium text-ink-700">{name}</div>
                    <div className="text-[10px] font-body text-ink-400">{role}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-body font-medium ${cls}`}>{status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -left-4 sm:-left-8 top-16 rounded-xl border border-cream-200 bg-white px-4 py-3 shadow-xl"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600">
            <Check className="h-4 w-4" strokeWidth={3} />
          </span>
          <div>
            <div className="text-xs font-body font-semibold text-ink-700">Offer accepted</div>
            <div className="text-[10px] font-body text-ink-400">Priya N. · just now</div>
          </div>
        </div>
      </motion.div>
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        className="absolute -right-3 sm:-right-6 bottom-10 rounded-xl border border-cream-200 bg-white px-4 py-3 shadow-xl"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brass-100 text-brass-600">
            <Send className="h-4 w-4" strokeWidth={2} />
          </span>
          <div>
            <div className="text-xs font-body font-semibold text-ink-700">6 offers sent</div>
            <div className="text-[10px] font-body text-ink-400">Spring Gala</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[18rem]">
      <div className="rounded-[2.5rem] border-[6px] border-curtain-700 bg-curtain-900 p-3 shadow-2xl">
        <div className="rounded-[1.9rem] bg-cream-50 p-5">
          <div className="text-xs font-body text-ink-400">Welcome back,</div>
          <div className="font-display text-lg font-semibold text-ink-800">Sarah Martinez</div>
          <div className="mt-4 text-[11px] font-body font-semibold uppercase tracking-wide text-ink-300">Upcoming</div>
          <div className="mt-2 space-y-2.5">
            {[
              ["Spring Gala", "Meridian Ensemble", "#A9791F"],
              ["Messiah — Dress", "City Chorale", "#9B2D3A"],
              ["Corporate Event", "Bright Lights Agency", "#1F7A70"],
            ].map(([title, org, color]) => (
              <div key={title} className="rounded-xl border border-cream-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  <div className="text-xs font-body font-semibold text-ink-700">{title}</div>
                </div>
                <div className="mt-0.5 pl-4 text-[10px] font-body text-ink-400">{org}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <div className="flex-1 rounded-lg bg-brass-500 py-2 text-center text-[11px] font-body font-semibold text-white">Accept</div>
            <div className="flex-1 rounded-lg border border-cream-300 py-2 text-center text-[11px] font-body text-ink-500">Decline</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ content ------------------------------ */

const PAINS = [
  { title: "The email spiral", body: "“Can you play Saturday?” becomes forty reply-all threads. You’re CC’ing people who already declined, and nobody’s sure who’s confirmed." },
  { title: "The spreadsheet maze", body: "Your master roster lives in three spreadsheets, a notes app, and someone’s memory. Finding the right person for an open seat takes longer than the seat is worth." },
  { title: "The payment chase", body: "“Did I pay them for the last one?” You’re digging through a payment app at 11pm trying to reconstruct who’s still owed." },
  { title: "The text avalanche", body: "“What time?” “Where do I park?” “Can someone sub for me?” Your phone never stops, and you’ve become a 24/7 help desk." },
];

const SOLUTIONS = [
  {
    title: "Your roster, finally organized",
    body: "Import your people in minutes. Track skills, contact info, pay preferences, and W-9 status. Filter by section, role, region, or your own tags — and find the right person in seconds.",
    icon: Users,
    points: ["Import from a spreadsheet in minutes", "Custom tags: first-call, section leaders, subs", "Skills, sections, and roles that fit your art form", "W-9 and pay preferences on file"],
    visual: (
      <div className="space-y-2">
        {[["Priya N.", "Principal Cello"], ["Marcus T.", "Lead Vocalist"], ["Ana G.", "Soprano · Section Leader"], ["Devon R.", "Stage Manager"]].map(([n, r]) => (
          <div key={n} className="flex items-center justify-between rounded-lg bg-cream-50 px-3 py-2">
            <span className="text-sm font-body text-ink-700">{n}</span>
            <span className="text-xs font-body text-ink-400">{r}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Offers they actually answer",
    body: "Send a professional offer in one click. People see the dates, the place, and the pay — and accept or decline right from their phone. No app, no login, no “did you get my email?”",
    icon: Send,
    points: ["One-click offers with dates, venue, and pay", "Accept or decline in a tap from any phone", "Expiration dates and automatic reminders", "Cascade to the next person when someone passes"],
    visual: (
      <div className="rounded-xl border border-cream-200 p-4">
        <div className="text-xs font-body font-semibold uppercase tracking-wide text-ink-300">Offer</div>
        <div className="mt-1 font-display text-lg font-semibold text-ink-800">Spring Gala — Meridian Ensemble</div>
        <div className="mt-2 space-y-1 text-sm font-body text-ink-500">
          <div>Sat, May 17 · The Riverside Ballroom</div>
          <div>Position: Principal Cello · Pay: $350</div>
        </div>
        <div className="mt-4 flex gap-2">
          <div className="flex-1 rounded-lg bg-brass-500 py-2 text-center text-xs font-body font-semibold text-white">Accept</div>
          <div className="flex-1 rounded-lg border border-cream-300 py-2 text-center text-xs font-body text-ink-500">Decline</div>
        </div>
      </div>
    ),
  },
  {
    title: "Staffing you can see",
    body: "See who’s confirmed, who’s pending, and who hasn’t answered. Fill open seats, save your go-to lineups as presets, and staff a whole project in a single pass.",
    icon: LayoutGrid,
    points: ["Confirmed, pending, and open at a glance", "Save go-to lineups as reusable presets", "Cascade offers down your call order", "Conflict warnings before you double-book"],
    visual: (
      <div className="space-y-2">
        {[["Violin I", "Confirmed", "bg-green-50 text-green-600"], ["Viola", "Pending", "bg-amber-50 text-amber-600"], ["Cello", "Confirmed", "bg-green-50 text-green-600"], ["Bass", "Open", "bg-ink-50 text-ink-400"]].map(([seat, status, cls]) => (
          <div key={seat} className="flex items-center justify-between rounded-lg border border-cream-200 px-3 py-2">
            <span className="text-sm font-body text-ink-700">{seat}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-body font-medium ${cls}`}>{status}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Payments you can actually track",
    body: "Know exactly who’s been paid and who’s waiting. Track pay per service, collect W-9s, send confirmations, and export at tax time — no second system, no shoebox.",
    icon: Wallet,
    points: ["Per-service pay and leader fees", "W-9 collection and 1099 export", "Automatic pay confirmations", "A full, exportable audit trail"],
    visual: (
      <div className="space-y-2">
        {[["Priya N.", "$350", "Paid", "text-green-600"], ["Marcus T.", "$250", "Paid", "text-green-600"], ["Ana G.", "$300", "Due", "text-amber-600"]].map(([n, amt, status, cls]) => (
          <div key={n} className="flex items-center justify-between rounded-lg bg-cream-50 px-3 py-2">
            <span className="text-sm font-body text-ink-700">{n}</span>
            <span className="flex items-center gap-3">
              <span className="text-sm font-body text-ink-500">{amt}</span>
              <span className={`text-xs font-body font-medium ${cls}`}>{status}</span>
            </span>
          </div>
        ))}
      </div>
    ),
  },
];

const NO_ACCOUNT_POINTS = [
  "Answers in minutes, not days",
  "No \u201cdid you get my email?\u201d threads",
  "W-9s collected without chasing",
  "Sub requests come to you, not a midnight text",
  "Dates land straight in their calendar",
  "No logins to reset or support",
];

const MARKET_STATS = [
  { value: "2,200+", label: "U.S. orchestras" },
  { value: "250+", label: "Dance companies" },
  { value: "170+", label: "Pro opera companies" },
  { value: "1,000s", label: "Choirs & churches with paid players" },
];

const PRICING_TIERS = [
  { name: "Free", price: "$0", tagline: "To get organized", headline: "Up to 25 performers, 3 projects", popular: false },
  { name: "Ensemble", price: "$29", tagline: "Small groups & single ensembles", headline: "Up to 60 performers, unlimited projects", popular: false },
  { name: "Orchestra", price: "$79", tagline: "Growing organizations", headline: "Up to 250 performers, subs & priority support", popular: true },
  { name: "Symphony", price: "$199", tagline: "Institutions", headline: "Unlimited everything, dedicated onboarding", popular: false },
];

const TESTIMONIALS = [
  {
    quote:
      "Staffing a full program used to take me most of an afternoon between emails, texts, and updating the spreadsheet. With Podium, I sent the entire call in under 15 minutes and could immediately see which chairs were filled.",
    name: "Rebecca C.",
    org: "Subito Strings",
  },
  {
    quote:
      "I expected to spend the first week explaining a new system to everyone. Instead, performers opened the offer on their phones and accepted or declined without creating an account. Almost everyone responded the same day.",
    name: "Kristen K.",
    org: "",
  },
  {
    quote:
      "Before Podium, our roster lived in a spreadsheet, old email threads, and three people's memories. Now I can see who was called, who declined, who's confirmed, and what still needs to be filled — without asking anyone for an update.",
    name: "David P.",
    org: "",
  },
];
