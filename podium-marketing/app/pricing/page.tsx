"use client";

import { Fragment } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { Check, ChevronRight, HelpCircle } from "lucide-react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

/* ------------------------------ tiers ------------------------------ */

type Tier = {
  name: string;
  price: string;
  tagline: string;
  cta: string;
  popular?: boolean;
  carriesOver?: string;
  features: string[];
};

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    tagline: "To get organized",
    cta: "Start free",
    features: [
      "1 admin seat",
      "Up to 25 performers",
      "3 active projects",
      "Offers & response tracking",
      "Payment tracking",
      "Free performer portal",
      "Skills & venue management",
      "Email support",
    ],
  },
  {
    name: "Ensemble",
    price: "$29",
    tagline: "Small groups & single ensembles",
    cta: "Start 14-day trial",
    carriesOver: "Free",
    features: [
      "Up to 60 performers",
      "Unlimited projects",
      "1 admin seat",
      "Bulk roster import (CSV/Excel)",
      "Saved lineup presets",
      "Email branding",
      "Gig details & group messaging",
      "Portal invites & W-9 requests",
    ],
  },
  {
    name: "Orchestra",
    price: "$79",
    tagline: "Growing organizations",
    cta: "Start 14-day trial",
    popular: true,
    carriesOver: "Ensemble",
    features: [
      "Up to 250 performers",
      "Up to 3 admin seats",
      "Substitution workflow",
      "QuickBooks / CSV export",
      "Priority support",
    ],
  },
  {
    name: "Symphony",
    price: "$199",
    tagline: "Institutions",
    cta: "Start 14-day trial",
    carriesOver: "Orchestra",
    features: [
      "Unlimited performers",
      "Unlimited admin seats",
      "Multi-ensemble management",
      "Dedicated onboarding",
    ],
  },
];

/* -------------------------- comparison table -------------------------- */

type Cell = boolean | string;

const comparison: {
  group: string;
  rows: { name: string; values: [Cell, Cell, Cell, Cell] }[];
}[] = [
  {
    group: "Scale",
    rows: [
      { name: "Performers in roster", values: ["25", "60", "250", "Unlimited"] },
      { name: "Active projects", values: ["3", "Unlimited", "Unlimited", "Unlimited"] },
      { name: "Admin seats", values: ["1", "1", "3", "Unlimited"] },
    ],
  },
  {
    group: "Core",
    rows: [
      { name: "Performer roster & profiles", values: [true, true, true, true] },
      { name: "Offers & response tracking", values: [true, true, true, true] },
      { name: "Payment tracking", values: [true, true, true, true] },
      { name: "Project staffing grid", values: [true, true, true, true] },
      { name: "Performer portal", values: [true, true, true, true] },
      { name: "Offer email notifications", values: [true, true, true, true] },
      { name: "Skills & venue management", values: [true, true, true, true] },
    ],
  },
  {
    group: "Growth",
    rows: [
      { name: "Bulk roster import (CSV/Excel)", values: [false, true, true, true] },
      { name: "Saved lineup presets", values: [false, true, true, true] },
      { name: "Email branding", values: [false, true, true, true] },
      { name: "Gig details & group messaging", values: [false, true, true, true] },
      { name: "Portal invites", values: [false, true, true, true] },
      { name: "W-9 requests", values: [false, true, true, true] },
      { name: "File distribution", values: [false, true, true, true] },
    ],
  },
  {
    group: "Advanced",
    rows: [
      { name: "Substitution workflow", values: [false, false, true, true] },
      { name: "QuickBooks / CSV export", values: [false, false, true, true] },
      { name: "Priority support", values: [false, false, true, true] },
    ],
  },
  {
    group: "Institution",
    rows: [
      { name: "Multi-ensemble management", values: [false, false, false, true] },
      { name: "Dedicated onboarding", values: [false, false, false, true] },
    ],
  },
  {
    group: "Support",
    rows: [
      { name: "Email support", values: [true, true, true, true] },
      { name: "Priority support", values: [false, false, true, true] },
      { name: "Dedicated onboarding", values: [false, false, false, true] },
    ],
  },
];

/* ------------------------------ faqs ------------------------------ */

const faqs = [
  {
    question: "What happens after my trial?",
    answer:
      "Your 14-day trial runs on a paid plan with no credit card required. When it ends, your account moves to the Free plan and every bit of your data stays put — your roster, projects, offers, and payment history are all retained. You simply can't exceed the Free limits or use paid features until you choose a plan. Upgrade whenever you're ready and everything unlocks again.",
  },
  {
    question: "Are performers really always free?",
    answer:
      "Always. The performer portal never costs your people a cent — one login to see the work from every group they play, sing, or dance for. Only the organization doing the staffing pays for Podium. Performers already have enough expenses.",
  },
  {
    question: "Which plan is right for me?",
    answer:
      "It comes down to roster size and how you work. Ensemble fits a chamber group, a single choir, a church music team, or a small agency running one lineup. Orchestra suits a growing organization that runs substitution cascades, exports to QuickBooks, and shares admin duties across a few people. Symphony is for institutions managing multiple ensembles with unlimited performers and seats. Free is a genuine home for getting organized, not just a teaser.",
  },
  {
    question: "What if I go over my performer limit?",
    answer:
      "Nothing you've built disappears. If you reach your plan's performer limit, your existing roster and data stay exactly as they are — you just can't add new performers until you upgrade or trim the list. We never delete your data to push you into a plan.",
  },
  {
    question: "Do you offer a nonprofit discount?",
    answer:
      "Yes. Registered 501(c)(3) organizations receive 25% off any paid plan. Reach out with your tax-exempt documentation and we'll apply the discount to your account.",
  },
  {
    question: "Can I change plans anytime?",
    answer:
      "Anytime, up or down. Move to a larger plan the moment your season grows, or step back down when it quiets — changes are prorated so you only pay for what you use. No contracts, no commitments, cancel with one click.",
  },
];

/* ------------------------------ page ------------------------------ */

export default function PricingPage() {
  return (
    <>
      {/* ============================ HERO ============================ */}
      <section className="relative overflow-hidden bg-cream-100 pt-32 pb-16 md:pt-40 md:pb-20">
        <div className="pointer-events-none absolute inset-0 bg-spotlight opacity-70" aria-hidden />
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-gradient-radial from-brass-200/40 to-transparent blur-2xl"
          aria-hidden
        />
        <div className="container-marketing relative">
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger}
            className="mx-auto max-w-2xl text-center"
          >
            <motion.div variants={fadeUp}>
              <span className="eyebrow justify-center">Simple pricing</span>
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="mt-5 font-display font-semibold text-ink-900 text-[2.75rem] leading-[1.05] sm:text-5xl lg:text-display-lg tracking-tight text-balance"
            >
              Start free. <span className="italic text-gradient-brass">Grow into it.</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mx-auto mt-6 max-w-xl font-body text-lg text-ink-500 leading-relaxed text-balance"
            >
              Performers are always free. Every paid plan starts with a 14-day free trial —
              no credit card required. Pick the tier that fits your roster today and change
              it whenever your season does.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ============================ CARDS ============================ */}
      <section className="pb-20">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          >
            {TIERS.map((tier) => (
              <motion.div
                key={tier.name}
                variants={fadeUp}
                className={`relative flex flex-col rounded-2xl border p-6 transition-all duration-300 ${
                  tier.popular
                    ? "border-brass-300 bg-white shadow-xl ring-2 ring-brass-300"
                    : "border-cream-300/60 bg-cream-50 hover:-translate-y-1 hover:shadow-xl hover:border-brass-200/60"
                }`}
              >
                {tier.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brass-500 px-3 py-1 text-[11px] font-body font-semibold uppercase tracking-wider text-white">
                    Most popular
                  </span>
                )}

                <h3 className="font-display text-xl font-semibold text-ink-800">{tier.name}</h3>

                <div className="mt-3 font-display text-3xl font-semibold text-ink-900">
                  {tier.price}
                  {tier.price !== "$0" && (
                    <span className="text-base font-body text-ink-400">/mo</span>
                  )}
                </div>

                <p className="mt-2 font-body text-sm text-ink-500 leading-snug">{tier.tagline}</p>

                {tier.carriesOver && (
                  <p className="mt-5 font-body text-sm font-medium text-ink-700">
                    Everything in {tier.carriesOver}, plus:
                  </p>
                )}

                <ul className={`space-y-3 ${tier.carriesOver ? "mt-3" : "mt-5"}`}>
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-brass-500"
                        strokeWidth={2.5}
                      />
                      <span className="font-body text-sm text-ink-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="https://app.podiumpersonnel.com/signup"
                  className={`mt-8 w-full justify-center ${
                    tier.popular ? "btn-accent" : "btn-secondary"
                  }`}
                >
                  {tier.cta}
                  {tier.popular && <ChevronRight className="ml-1 h-4 w-4" />}
                </Link>
              </motion.div>
            ))}
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mx-auto mt-8 max-w-2xl text-center font-body text-sm text-ink-400 leading-relaxed"
          >
            14-day free trial on any paid plan, no credit card required. Cancel anytime —
            after your trial, your account drops to Free with all your data retained.
            Performers are always free, and registered 501(c)(3) nonprofits get 25% off.
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-4 text-center font-body text-sm text-ink-500"
          >
            <Link
              href="/waitlist"
              className="font-medium text-brass-600 underline-offset-4 hover:underline"
            >
              Early? Join the founding-member waitlist →
            </Link>
          </motion.p>
        </div>
      </section>

      {/* ======================= COMPARISON TABLE ======================= */}
      <section className="section-padding bg-white">
        <div className="container-marketing">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-2xl text-center"
          >
            <span className="eyebrow justify-center">Compare plans</span>
            <h2 className="mt-4 font-display text-3xl md:text-display-md font-semibold text-ink-800 tracking-tight">
              Every plan, side by side
            </h2>
            <p className="mt-4 font-body text-lg text-ink-500 leading-relaxed">
              See exactly what&apos;s included as you grow from Free to Symphony.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12 overflow-x-auto"
          >
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b-2 border-cream-200">
                  <th className="py-4 pr-4 text-left font-display text-ink-800">Features</th>
                  {TIERS.map((tier) => (
                    <th
                      key={tier.name}
                      className={`py-4 px-4 text-center font-display text-ink-800 ${
                        tier.popular ? "bg-brass-50/70 rounded-t-lg" : ""
                      }`}
                    >
                      {tier.name}
                      <span className="block font-body text-sm font-normal text-ink-400">
                        {tier.price === "$0" ? "$0" : `${tier.price}/mo`}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.map((section) => (
                  <Fragment key={section.group}>
                    <tr>
                      <td
                        colSpan={5}
                        className="pt-8 pb-3 font-display text-sm uppercase tracking-wide text-ink-500"
                      >
                        {section.group}
                      </td>
                    </tr>
                    {section.rows.map((row) => (
                      <tr
                        key={`${section.group}-${row.name}`}
                        className="border-b border-cream-100"
                      >
                        <td className="py-4 pr-4 font-body text-ink-700">{row.name}</td>
                        {row.values.map((value, i) => (
                          <td
                            key={i}
                            className={`py-4 px-4 text-center ${
                              TIERS[i].popular ? "bg-brass-50/70" : ""
                            }`}
                          >
                            {typeof value === "boolean" ? (
                              value ? (
                                <Check
                                  className="mx-auto h-5 w-5 text-brass-500"
                                  strokeWidth={2.5}
                                />
                              ) : (
                                <span className="text-ink-300">—</span>
                              )
                            ) : (
                              <span className="font-body text-sm text-ink-600">{value}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* ============================ FAQ ============================ */}
      <section className="section-padding bg-cream-100">
        <div className="container-marketing">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-2xl text-center"
          >
            <span className="eyebrow justify-center">Good to know</span>
            <h2 className="mt-4 font-display text-3xl md:text-display-md font-semibold text-ink-800 tracking-tight">
              Frequently asked questions
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2"
          >
            {faqs.map((faq) => (
              <motion.div key={faq.question} variants={fadeUp} className="card">
                <h3 className="flex items-start gap-3 font-display text-lg font-semibold text-ink-800">
                  <HelpCircle className="mt-0.5 h-6 w-6 shrink-0 text-brass-500" strokeWidth={1.8} />
                  {faq.question}
                </h3>
                <p className="mt-3 pl-9 font-body text-ink-500 leading-relaxed">{faq.answer}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ============================ FINAL CTA ============================ */}
      <section className="spotlight-stage section-padding text-center text-cream-100">
        <div className="container-marketing relative">
          <span className="eyebrow justify-center !text-brass-400 before:!bg-brass-400/60">
            Ready when you are
          </span>
          <h2 className="mx-auto mt-5 max-w-2xl font-display text-3xl md:text-display-md font-semibold text-cream-50 tracking-tight">
            Start free. Grow into it.
          </h2>
          <p className="mx-auto mt-5 max-w-xl font-body text-lg text-cream-300 leading-relaxed">
            Create your organization in under five minutes. Every paid plan starts with a
            14-day free trial — no credit card required, and performers are always free.
          </p>
          <div className="mt-9 flex justify-center">
            <Link
              href="https://app.podiumpersonnel.com/signup"
              className="btn-accent group text-base"
            >
              Start free
              <ChevronRight className="ml-1 h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {["Performers always free", "Cancel anytime", "25% nonprofit discount"].map((b) => (
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
