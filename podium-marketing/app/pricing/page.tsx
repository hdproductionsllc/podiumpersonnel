"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, X, ChevronRight, HelpCircle, Shield, Clock, Zap } from "lucide-react";

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const comparisonFeatures = [
  {
    category: "Scale",
    features: [
      { name: "Musicians in roster", free: "25", pro: "Unlimited" },
      { name: "Active projects", free: "3", pro: "Unlimited" },
      { name: "Admin seats", free: "1 (owner)", pro: "Unlimited" },
    ],
  },
  {
    category: "Core Features",
    features: [
      { name: "Musician roster & profiles", free: true, pro: true },
      { name: "Contract offers & tracking", free: true, pro: true },
      { name: "Payment tracking", free: true, pro: true },
      { name: "Project staffing grid", free: true, pro: true },
      { name: "Musician portal access", free: true, pro: true },
      { name: "Offer email notifications", free: true, pro: true },
      { name: "Instrument & venue management", free: true, pro: true },
    ],
  },
  {
    category: "Pro Features",
    features: [
      { name: "Bulk roster import (CSV/Excel)", free: false, pro: true },
      { name: "Saved ensemble presets", free: false, pro: true },
      { name: "Gig details emails", free: false, pro: true },
      { name: "Group text messaging", free: false, pro: true },
      { name: "Portal invite emails", free: false, pro: true },
      { name: "W-9 request emails", free: false, pro: true },
      { name: "Music distribution emails", free: false, pro: true },
      { name: "Additional admin seats", free: false, pro: true },
    ],
  },
  {
    category: "Support",
    features: [
      { name: "Email support", free: true, pro: true },
      { name: "Priority support", free: false, pro: true },
    ],
  },
];

const faqs = [
  {
    question: "What happens after my 14-day trial?",
    answer:
      "After your trial, your account moves to the Free plan. You keep all your data — you just can't exceed the Free limits (25 musicians, 3 active projects) or use Pro features like bulk import and saved ensembles. Upgrade anytime to unlock everything again.",
  },
  {
    question: "Do musicians have to pay?",
    answer:
      "Never. The musician portal is always free for musicians. Only organizations pay for Podium. We believe musicians already have enough expenses.",
  },
  {
    question: "Can I send contract offers on the Free plan?",
    answer:
      "Yes! Contract offers are included on every plan — it's the core of what Podium does. Free plan users can send offers, track responses, and manage their projects. Pro unlocks additional communication tools like gig details, group messaging, and portal invites.",
  },
  {
    question: "What if I already have more than 25 musicians?",
    answer:
      "If you exceed Free plan limits, your existing data is safe — you just won't be able to add new musicians or projects until you upgrade or trim your roster. We never delete your data.",
  },
  {
    question: "Is there a contract or commitment?",
    answer:
      "No contracts, no commitments. Pay monthly, cancel anytime with one click. We believe in earning your business every month.",
  },
  {
    question: "Do you offer discounts for nonprofits?",
    answer:
      "Yes! Registered 501(c)(3) organizations receive 25% off. Contact us with your tax-exempt documentation to apply the discount.",
  },
];

export default function PricingPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative pt-32 pb-16 md:pt-40 md:pb-20 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-radial from-brass-200/30 via-transparent to-transparent opacity-60" />
          {/* Musical staff lines - subtle */}
          <div className="absolute top-[40%] left-[8%] w-[25%] flex flex-col gap-2 opacity-[0.04]">
            {[...Array(5)].map((_, i) => (
              <div key={`staff-l-${i}`} className="h-px bg-ink-800" />
            ))}
          </div>
          <div className="absolute top-[50%] right-[6%] w-[20%] flex flex-col gap-2 opacity-[0.03]">
            {[...Array(5)].map((_, i) => (
              <div key={`staff-r-${i}`} className="h-px bg-ink-800" />
            ))}
          </div>
        </div>

        <div className="container-marketing">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="max-w-3xl mx-auto text-center"
          >
            {/* Decorative brass line */}
            <motion.div
              variants={fadeInUp}
              className="w-16 h-0.5 bg-gradient-to-r from-brass-400 to-brass-500 mx-auto mb-8 rounded-full"
            />

            <motion.h1
              variants={fadeInUp}
              className="font-display text-display-lg md:text-display-xl text-ink-900 mb-6"
            >
              Start free. Upgrade when you need more.
            </motion.h1>
            <motion.p
              variants={fadeInUp}
              className="font-body text-xl text-ink-500 mb-4"
            >
              No setup fees. No hidden costs. Musicians always free.
            </motion.p>
            <motion.p
              variants={fadeInUp}
              className="font-body text-base text-ink-400"
            >
              Every new account gets a 14-day Pro trial. No credit card required.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto"
          >
            {/* Free Plan */}
            <motion.div
              variants={fadeInUp}
              className="relative rounded-2xl p-8 bg-white border border-cream-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <h3 className="font-display text-2xl text-ink-800 mb-2">Free</h3>

              <div className="mb-2">
                <span className="font-display text-display-md text-ink-900">$0</span>
                <span className="text-ink-400">/month</span>
              </div>

              <p className="font-body text-sm text-ink-500 mb-6">
                Everything you need to manage a roster and send offers. Perfect for getting started.
              </p>

              <ul className="space-y-3 mb-8">
                {[
                  "Up to 25 musicians",
                  "3 active projects",
                  "1 admin seat",
                  "Contract offers & tracking",
                  "Payment tracking",
                  "Musician portal access",
                  "Instrument & venue management",
                  "Email support",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-brass-500" />
                    <span className="font-body text-sm text-ink-600">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="https://app.podiumpersonnel.com/signup"
                className="btn-secondary w-full justify-center"
              >
                Get Started Free
              </Link>
            </motion.div>

            {/* Pro Plan */}
            <motion.div
              variants={fadeInUp}
              className="relative rounded-2xl p-8 bg-ink-800 text-cream-50 shadow-xl shadow-ink-900/20 scale-105 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
            >
              {/* Brass glow behind popular card */}
              <div className="absolute -inset-4 -z-10 bg-gradient-radial from-brass-500/20 via-transparent to-transparent rounded-3xl" />
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.5, ease: "easeOut" }}
                className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-brass-500 text-white text-sm font-body font-medium rounded-full"
              >
                14-Day Free Trial
              </motion.div>

              <h3 className="font-display text-2xl text-cream-50 mb-2">Pro</h3>

              <div className="mb-2">
                <span className="font-display text-display-md text-gradient-brass">$29</span>
                <span className="text-cream-300">/month</span>
              </div>

              <p className="font-body text-sm text-cream-300 mb-6">
                Unlimited everything. For busy contractors, growing ensembles, and large rosters.
              </p>

              <ul className="space-y-3 mb-8">
                {[
                  "Unlimited musicians",
                  "Unlimited projects",
                  "Unlimited admin seats",
                  "Everything in Free, plus:",
                  "Bulk roster import (CSV/Excel)",
                  "Saved ensemble presets",
                  "Gig details & group messaging",
                  "Portal invites & W-9 requests",
                  "Priority support",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-brass-400" />
                    <span className="font-body text-sm text-cream-200">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="https://app.podiumpersonnel.com/signup"
                className="btn-accent w-full justify-center"
              >
                Start Free Trial
                <ChevronRight className="ml-1 w-4 h-4" />
              </Link>
            </motion.div>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-center mt-8 text-sm text-ink-400 font-body"
          >
            No credit card required to start. Cancel anytime.
          </motion.p>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="section-padding bg-white">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-12"
          >
            <h2 className="font-display text-display-sm md:text-display-md text-ink-900 mb-4">
              Compare plans
            </h2>
            <p className="font-body text-lg text-ink-500">
              See exactly what&apos;s included in each plan.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="overflow-x-auto max-w-3xl mx-auto"
          >
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b-2 border-cream-200">
                  <th className="text-left py-4 pr-4 font-display text-ink-800">
                    Features
                  </th>
                  <th className="text-center py-4 px-6 font-display text-ink-800">
                    Free
                    <span className="block font-body text-sm font-normal text-ink-400">
                      $0/mo
                    </span>
                  </th>
                  <th className="text-center py-4 px-6 font-display text-ink-800 bg-brass-50/70 rounded-t-lg">
                    Pro
                    <span className="block font-body text-sm font-normal text-ink-400">
                      $29/mo
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((category) => (
                  <>
                    <tr key={category.category}>
                      <td
                        colSpan={3}
                        className="pt-8 pb-3 font-display text-sm text-ink-500 uppercase tracking-wide"
                      >
                        {category.category}
                      </td>
                    </tr>
                    {category.features.map((feature, idx) => (
                      <tr
                        key={feature.name}
                        className={`hover:bg-brass-50/30 transition-colors ${idx % 2 === 0 ? "bg-cream-50" : ""} ${idx !== category.features.length - 1 ? "border-b border-cream-100" : ""}`}
                      >
                        <td className="py-4 pr-4 font-body text-ink-700">
                          {feature.name}
                        </td>
                        <td className="py-4 px-6 text-center">
                          {typeof feature.free === "boolean" ? (
                            feature.free ? (
                              <CheckCircle2 className="w-5 h-5 text-brass-500 mx-auto" />
                            ) : (
                              <X className="w-5 h-5 text-ink-300 mx-auto" />
                            )
                          ) : (
                            <span className="font-body text-sm text-ink-600">
                              {feature.free}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-center bg-brass-50/70">
                          {typeof feature.pro === "boolean" ? (
                            feature.pro ? (
                              <CheckCircle2 className="w-5 h-5 text-brass-500 mx-auto" />
                            ) : (
                              <X className="w-5 h-5 text-ink-300 mx-auto" />
                            )
                          ) : (
                            <span className="font-body text-sm text-ink-600">
                              {feature.pro}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="section-padding bg-cream-100">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-12"
          >
            <h2 className="font-display text-display-sm md:text-display-md text-ink-900 mb-4">
              Frequently asked questions
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto"
          >
            {faqs.map((faq) => (
              <motion.div key={faq.question} variants={fadeInUp} className="card">
                <h3 className="font-display text-lg text-ink-800 mb-3 flex items-start gap-3">
                  <HelpCircle className="w-6 h-6 text-brass-500 flex-shrink-0 mt-0.5" />
                  {faq.question}
                </h3>
                <p className="font-body text-ink-500 leading-relaxed pl-8">
                  {faq.answer}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section-padding bg-gradient-to-br from-ink-800 via-ink-800 to-ink-900 text-cream-50 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-brass-500/10 via-transparent to-transparent" />
          {/* Musical staff lines */}
          <div className="absolute top-[30%] left-[5%] w-[20%] flex flex-col gap-2 opacity-[0.04]">
            {[...Array(5)].map((_, i) => (
              <div key={`cta-staff-l-${i}`} className="h-px bg-cream-100" />
            ))}
          </div>
          <div className="absolute bottom-[25%] right-[5%] w-[20%] flex flex-col gap-2 opacity-[0.04]">
            {[...Array(5)].map((_, i) => (
              <div key={`cta-staff-r-${i}`} className="h-px bg-cream-100" />
            ))}
          </div>
        </div>

        <div className="container-marketing relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="max-w-3xl mx-auto text-center"
          >
            {/* Decorative brass line */}
            <motion.div
              variants={fadeInUp}
              className="w-16 h-0.5 bg-gradient-to-r from-brass-400 to-brass-500 mx-auto mb-8 rounded-full"
            />

            <motion.h2 variants={fadeInUp} className="font-display text-display-md mb-6">
              Ready to get organized?
            </motion.h2>
            <motion.p variants={fadeInUp} className="font-body text-xl text-cream-300 mb-10">
              Start your 14-day Pro trial. No credit card required. Set up in
              under 5 minutes.
            </motion.p>

            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
              <Link href="https://app.podiumpersonnel.com/signup" className="btn-accent text-lg px-8 py-4 group">
                Start Free Trial
                <ChevronRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>

            {/* Trust badges - glass cards */}
            <motion.div variants={fadeInUp} className="flex flex-wrap items-center justify-center gap-4">
              {[
                { icon: Shield, text: "Bank-level security" },
                { icon: Clock, text: "Cancel anytime" },
                { icon: Zap, text: "5-minute setup" },
              ].map((badge) => (
                <div key={badge.text} className="flex items-center gap-2 px-4 py-2 bg-cream-50/5 border border-cream-100/10 rounded-full backdrop-blur-sm">
                  <badge.icon className="w-4 h-4 text-brass-400" />
                  <span className="text-sm font-body text-cream-300">{badge.text}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
