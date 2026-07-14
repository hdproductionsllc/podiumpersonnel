"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  ChevronRight,
  Heart,
  Target,
  Lightbulb,
  Shield,
  Clock,
  Sparkles,
} from "lucide-react";

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const values = [
  {
    icon: Heart,
    title: "Performers first",
    description:
      "Every feature starts with one question: does this make life easier for the people who perform and the people who staff them? If it doesn't, we don't build it.",
  },
  {
    icon: Target,
    title: "Simple over complex",
    description:
      "Enterprise arts software is powerful and overwhelming. We believe the best tools are the ones you can use on a deadline without a manual or an onboarding call.",
  },
  {
    icon: Lightbulb,
    title: "Built by people who've run the call",
    description:
      "We've managed personnel, chased subs, and reconciled who got paid. We built the tool we wished existed instead of guessing from the outside.",
  },
  {
    icon: Shield,
    title: "Honest and transparent",
    description:
      "No hidden fees, no surprise charges, no dark patterns, no invented customer counts. We earn your trust by being straightforward — including about being early.",
  },
];

const timeline = [
  {
    year: "The itch",
    title: "One phone tree too many",
    description:
      "After enough lost weekends spent texting to fill open seats — and enough spreadsheets that only one person could read — we started sketching what better personnel management could look like.",
  },
  {
    year: "The build",
    title: "A tool we'd actually use",
    description:
      "We built the core loop we needed ourselves: a real roster, offers people answer from their phone, a cascade to the next person when someone passes, and pay tracking that doesn't live in a shoebox.",
  },
  {
    year: "The pivot",
    title: "Same problem, every art form",
    description:
      "We started with chamber musicians, then heard the same story from choirs, theatres, dance companies, churches, and agencies. The call is the call everywhere. So we broadened Podium to speak each art form's language.",
  },
  {
    year: "Now",
    title: "Early, and building in the open",
    description:
      "Podium is young. A handful of founding organizations use it today, and we're shaping it alongside them. We'd rather tell you that honestly than dress it up in numbers we haven't earned.",
  },
];

const marketFacts = [
  { value: "2,200+", label: "U.S. orchestras" },
  { value: "170+", label: "Pro opera companies" },
  { value: "250+", label: "Dance companies" },
  { value: "1,000s", label: "Choirs & churches with paid players" },
];

export default function AboutPage() {
  return (
    <>
      {/* ============================ HERO ============================ */}
      <section className="relative overflow-hidden bg-cream-100 pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="pointer-events-none absolute inset-0 bg-spotlight opacity-70" aria-hidden />
        <div className="pointer-events-none absolute -top-24 right-0 h-[36rem] w-[36rem] rounded-full bg-gradient-radial from-brass-200/40 to-transparent blur-2xl" aria-hidden />

        <div className="container-marketing relative">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="max-w-3xl"
          >
            <motion.div variants={fadeInUp}>
              <span className="eyebrow">Our story</span>
            </motion.div>
            <motion.h1
              variants={fadeInUp}
              className="mt-5 font-display font-semibold text-ink-900 text-[2.75rem] leading-[1.05] sm:text-6xl lg:text-display-lg tracking-tight"
            >
              We&apos;ve been in <span className="italic text-gradient-brass">your shoes.</span>
            </motion.h1>
            <motion.div variants={fadeInUp} className="mt-6 flex items-center gap-4">
              <span className="decorative-line" />
              <p className="max-w-xl font-body text-lg text-ink-500 leading-relaxed">
                Podium was built by people who&apos;ve actually run the call — managed
                personnel across rehearsals and performances — and got tired of the chaos.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ============================ OUR STORY ============================ */}
      <section className="section-padding bg-white">
        <div className="container-marketing">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={fadeInUp}
            >
              <span className="eyebrow">The problem we lived</span>
              <h2 className="mt-4 font-display text-3xl md:text-display-md font-semibold text-ink-900 tracking-tight">
                Our story
              </h2>
              <div className="mt-6 space-y-6 font-body text-lg text-ink-600 leading-relaxed">
                <p>
                  We&apos;ve sent the 2am &ldquo;can anyone sub tomorrow?&rdquo; texts.
                  We&apos;ve lost track of who&apos;s been paid. We&apos;ve watched good
                  performers slip through the cracks because our &ldquo;system&rdquo; was a
                  pile of spreadsheets, group texts, and memory.
                </p>
                <p>
                  Enterprise arts software exists — but it costs tens of thousands and takes
                  months to implement. Rock-band and DJ booking apps exist too, but
                  they&apos;re built for a different world, with no concept of sections,
                  covers, sub cascades, or 1099s.
                </p>
                <p>
                  So we built Podium for the middle everyone ignores: modern, affordable, and
                  designed for the organizations that staff performers per event — orchestras,
                  choirs, theatre, dance, worship, and agencies alike.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <div className="rounded-2xl border border-cream-300/70 bg-white shadow-2xl shadow-ink-900/10 overflow-hidden">
                <div className="flex items-center gap-1.5 border-b border-cream-200 bg-cream-100 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-burgundy-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-brass-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
                </div>
                <div className="p-5">
                  <div className="text-[11px] font-body font-semibold uppercase tracking-wide text-ink-300">
                    Staffing status
                  </div>
                  <div className="mt-3 space-y-2">
                    {[
                      ["Priya N.", "Principal Cello", "Accepted", "text-green-600 bg-green-50"],
                      ["Ana G.", "Soprano · Section Lead", "Accepted", "text-green-600 bg-green-50"],
                      ["Marcus T.", "Lead Vocalist", "Pending", "text-amber-600 bg-amber-50"],
                      ["Devon R.", "Stage Manager", "Viewed", "text-blue-600 bg-blue-50"],
                    ].map(([name, role, status, cls]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between rounded-lg border border-cream-200 px-3 py-2.5"
                      >
                        <div>
                          <div className="text-sm font-body font-medium text-ink-700">{name}</div>
                          <div className="text-[11px] font-body text-ink-400">{role}</div>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-body font-medium ${cls}`}>
                          {status}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <div className="flex-1 rounded-lg bg-brass-500 py-2 text-center text-[11px] font-body font-semibold text-white">
                      Send next offer
                    </div>
                    <div className="flex-1 rounded-lg border border-cream-300 py-2 text-center text-[11px] font-body text-ink-500">
                      View roster
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -right-4 -bottom-4 -z-10 w-32 h-32 bg-brass-300/30 rounded-full blur-2xl" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ============================ MISSION ============================ */}
      <section className="spotlight-stage section-padding text-cream-100">
        <div className="container-marketing relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="max-w-3xl mx-auto text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-brass-500/20 text-brass-400 flex items-center justify-center mx-auto mb-6">
              <Target className="w-8 h-8" strokeWidth={1.6} />
            </div>
            <span className="eyebrow !text-brass-400 before:!bg-brass-400/60 justify-center">
              Our mission
            </span>
            <p className="mt-6 font-display text-2xl md:text-3xl italic leading-relaxed text-cream-50">
              Make staffing the performing arts so simple that you can spend your time on the
              work — the rehearsal, the performance, the art — not the admin.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ============================ WHAT WE BELIEVE ============================ */}
      <section className="section-padding bg-cream-100">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="mx-auto max-w-2xl text-center"
          >
            <span className="eyebrow justify-center">What we believe</span>
            <h2 className="mt-4 font-display text-3xl md:text-display-md font-semibold text-ink-800 tracking-tight">
              The principles behind the product
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="mt-14 grid md:grid-cols-2 gap-6 max-w-4xl mx-auto"
          >
            {values.map((value) => (
              <motion.div
                key={value.title}
                variants={fadeInUp}
                className="card group relative"
              >
                <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-brass-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="w-12 h-12 rounded-xl bg-brass-100 text-brass-600 flex items-center justify-center mb-5">
                  <value.icon className="w-6 h-6" strokeWidth={1.6} />
                </div>
                <h3 className="font-display text-xl font-semibold text-ink-800 mb-3">
                  {value.title}
                </h3>
                <p className="font-body text-ink-500 leading-relaxed">{value.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ============================ JOURNEY ============================ */}
      <section className="section-padding bg-white">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="mx-auto max-w-2xl text-center"
          >
            <span className="eyebrow justify-center">How we got here</span>
            <h2 className="mt-4 font-display text-3xl md:text-display-md font-semibold text-ink-800 tracking-tight">
              Our journey
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="mt-14 max-w-3xl mx-auto"
          >
            {timeline.map((item, index) => (
              <motion.div
                key={item.title}
                variants={fadeInUp}
                className="flex gap-6 sm:gap-8 pb-12 last:pb-0"
              >
                <div className="flex-shrink-0 w-24 sm:w-28">
                  <span className="font-display text-lg sm:text-xl font-semibold text-brass-500">
                    {item.year}
                  </span>
                </div>

                <div className="relative flex-shrink-0">
                  <div className="absolute -inset-1 bg-brass-300/30 rounded-full blur-md" />
                  <div className="relative w-4 h-4 bg-brass-400 rounded-full" />
                  {index !== timeline.length - 1 && (
                    <div className="absolute top-4 left-1.5 w-1 h-full bg-gradient-to-b from-brass-300 to-brass-100" />
                  )}
                </div>

                <div className="pb-8">
                  <h3 className="font-display text-xl font-semibold text-ink-800 mb-2">
                    {item.title}
                  </h3>
                  <p className="font-body text-ink-500 leading-relaxed">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ==================== THE FIELD WE'RE BUILT FOR (honest) ==================== */}
      <section className="section-padding bg-cream-100">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="mx-auto max-w-2xl text-center"
          >
            <span className="eyebrow justify-center">The field we&apos;re built for</span>
            <h2 className="mt-4 font-display text-3xl md:text-display-md font-semibold text-ink-800 tracking-tight text-balance">
              A whole art form runs on freelancers
            </h2>
            <p className="mt-4 font-body text-lg text-ink-500 leading-relaxed text-balance">
              These aren&apos;t our customers — they&apos;re the field we set out to serve:
              the thousands of organizations that hire per performance and sit below the
              six-figure enterprise price floor.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-6"
          >
            {marketFacts.map((fact) => (
              <motion.div
                key={fact.label}
                variants={fadeInUp}
                className="text-center bg-cream-50 border border-cream-200 rounded-2xl p-6"
              >
                <p className="font-display text-4xl md:text-5xl font-semibold text-gradient-brass mb-2">
                  {fact.value}
                </p>
                <p className="font-body text-sm text-ink-500">{fact.label}</p>
              </motion.div>
            ))}
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-8 text-center font-body text-xs text-ink-400"
          >
            Market figures from public sources — the League of American Orchestras, OPERA
            America, and Dance/USA.
          </motion.p>
        </div>
      </section>

      {/* ============================ WHO BUILT IT ============================ */}
      <section className="section-padding bg-white">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="mx-auto max-w-2xl text-center"
          >
            <span className="eyebrow justify-center">Who&apos;s behind it</span>
            <h2 className="mt-4 font-display text-3xl md:text-display-md font-semibold text-ink-900 tracking-tight text-balance">
              Built by people who&apos;ve run the call
            </h2>
            <p className="mt-4 font-body text-lg text-ink-500 leading-relaxed text-balance">
              Our small team combines real experience in performing-arts personnel and
              operations with software engineering — enough to know what actually happens
              backstage, and enough to build something that respects it.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ============================ CTA ============================ */}
      <section className="spotlight-stage section-padding text-center text-cream-100">
        <div className="container-marketing relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="max-w-3xl mx-auto"
          >
            <span className="eyebrow !text-brass-400 before:!bg-brass-400/60 justify-center">
              Ready when you are
            </span>
            <h2 className="mt-5 font-display text-3xl md:text-display-md font-semibold text-cream-50 tracking-tight">
              Come build it with us
            </h2>
            <p className="mx-auto mt-5 max-w-xl font-body text-lg text-cream-300 leading-relaxed">
              Whether you staff a quartet, a symphony, a stage, or a Sunday service,
              we&apos;d love to help you spend less time on admin and more time on the art.
            </p>

            <div className="mt-9 flex justify-center">
              <Link
                href="https://app.podiumpersonnel.com/signup"
                className="btn-accent group text-base"
              >
                Start Free Trial
                <ChevronRight className="ml-1 w-5 h-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <span className="glass-badge text-sm text-cream-300">
                <Shield className="h-4 w-4 text-brass-400" />
                No credit card required
              </span>
              <span className="glass-badge text-sm text-cream-300">
                <Clock className="h-4 w-4 text-brass-400" />
                14-day free trial
              </span>
              <span className="glass-badge text-sm text-cream-300">
                <Sparkles className="h-4 w-4 text-brass-400" />
                Set up in 5 minutes
              </span>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
