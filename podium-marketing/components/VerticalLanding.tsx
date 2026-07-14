"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { ChevronRight, Check, ArrowRight, ArrowLeft } from "lucide-react";
import type { Vertical } from "@/lib/verticals";
import { VerticalIcon } from "@/components/VerticalIcon";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };

export function VerticalLanding({ v }: { v: Vertical }) {
  const themeVars = {
    ["--accent" as string]: v.accent,
    ["--accent-soft" as string]: v.accentSoft,
    ["--accent-glow" as string]: v.accentGlow,
    ["--stage-glow" as string]: `radial-gradient(ellipse 70% 55% at 50% -5%, ${v.accentGlow}, transparent 70%)`,
  } as React.CSSProperties;

  return (
    <div style={themeVars}>
      {/* ============================ HERO ============================ */}
      <section className="relative overflow-hidden bg-cream-100 pt-32 pb-20 md:pt-40 md:pb-24">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(ellipse 80% 60% at 50% -10%, ${v.accentGlow}, transparent 70%)` }}
          aria-hidden
        />
        <div className="container-marketing relative">
          <motion.div initial="hidden" animate="show" variants={stagger} className="mx-auto max-w-3xl text-center">
            <motion.div variants={fadeUp}>
              <Link
                href="/#art-forms"
                className="inline-flex items-center gap-1.5 font-body text-sm text-ink-400 hover:text-ink-600 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                All art forms
              </Link>
            </motion.div>

            <motion.div variants={fadeUp} className="mt-6 flex justify-center">
              <span
                className="inline-flex items-center gap-2.5 rounded-full px-4 py-2 font-body text-sm font-medium"
                style={{ backgroundColor: v.accentSoft, color: v.accent }}
              >
                <VerticalIcon name={v.icon} className="h-4 w-4" strokeWidth={1.75} />
                {v.eyebrow}
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="mt-6 font-display font-semibold text-ink-900 text-4xl sm:text-5xl lg:text-display-lg leading-[1.06] tracking-tight"
            >
              {v.headline} <span className="italic accent-text">{v.headlineEm}</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="mx-auto mt-6 max-w-2xl font-body text-lg text-ink-500 leading-relaxed">
              {v.subhead}
            </motion.p>

            <motion.div variants={fadeUp} className="mt-9 flex flex-col sm:flex-row justify-center gap-4">
              <Link href="https://app.podiumpersonnel.com/signup" className="btn-accent-dynamic group text-base">
                Start Free Trial
                <ChevronRight className="ml-1 w-5 h-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/features" className="btn-secondary text-base">
                See the features
              </Link>
            </motion.div>

            <motion.p variants={fadeUp} className="mt-6 font-body text-sm text-ink-400">
              14-day free trial · No credit card required
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ============================ PAINS ============================ */}
      <section className="section-padding bg-white">
        <div className="container-marketing">
          <Heading eyebrow="Sound familiar?" title="The part nobody signed up for" />
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="mt-14 grid md:grid-cols-3 gap-5"
          >
            {v.pains.map((p) => (
              <motion.div key={p.title} variants={fadeUp} className="card">
                <h3 className="font-display text-xl font-semibold text-ink-800">{p.title}</h3>
                <p className="mt-3 font-body text-ink-500 leading-relaxed">{p.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ============================ CAPABILITIES ============================ */}
      <section className="section-padding bg-cream-100">
        <div className="container-marketing">
          <Heading eyebrow={`Podium for ${v.name.toLowerCase()}`} title="Everything the call needs" />
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="mt-14 grid md:grid-cols-2 gap-5"
          >
            {v.capabilities.map((c) => (
              <motion.div key={c.title} variants={fadeUp} className="flex gap-4 rounded-2xl bg-white border border-cream-300/60 p-6">
                <span
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: v.accentSoft, color: v.accent }}
                >
                  <Check className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink-800">{c.title}</h3>
                  <p className="mt-1.5 font-body text-ink-500 leading-relaxed">{c.body}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ============================ PULL QUOTE + AUDIENCE ============================ */}
      <section className="spotlight-stage section-padding text-cream-100">
        <div className="container-marketing relative">
          <motion.blockquote
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-3xl text-center"
          >
            <p className="font-display text-2xl md:text-4xl italic text-cream-50 leading-snug">
              &ldquo;{v.testimonial ? v.testimonial.quote : v.pullQuote}&rdquo;
            </p>
            {v.testimonial && (
              <footer className="mt-6 font-body text-sm text-cream-300">
                <span className="font-semibold text-cream-100">{v.testimonial.name}</span>
                {v.testimonial.org && <span> · {v.testimonial.org}</span>}
              </footer>
            )}
          </motion.blockquote>

          <div className="mx-auto mt-14 max-w-4xl">
            <p className="text-center font-body text-sm font-semibold uppercase tracking-[0.2em] text-brass-400">
              Made for
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {v.audience.map((a) => (
                <span
                  key={a}
                  className="rounded-full border border-cream-100/15 bg-cream-50/5 px-4 py-2 font-body text-sm text-cream-200 backdrop-blur-sm"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================ FAQ ============================ */}
      <section className="section-padding bg-white">
        <div className="container-marketing">
          <Heading eyebrow="Questions" title="Good to know" />
          <div className="mx-auto mt-12 max-w-3xl divide-y divide-cream-200">
            {v.faqs.map((f) => (
              <motion.div
                key={f.q}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="py-6"
              >
                <h3 className="font-display text-lg font-semibold text-ink-800">{f.q}</h3>
                <p className="mt-2 font-body text-ink-500 leading-relaxed">{f.a}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ CTA ============================ */}
      <section className="section-padding bg-cream-100">
        <div className="container-marketing">
          <div className="relative overflow-hidden rounded-3xl bg-curtain-800 px-6 py-16 text-center md:px-12">
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: `radial-gradient(ellipse 70% 80% at 50% 0%, ${v.accentGlow}, transparent 70%)` }}
              aria-hidden
            />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl font-display text-3xl md:text-4xl font-semibold text-cream-50 tracking-tight">
                Fill your next {v.vocab.work.replace(/s$/, "")} without the phone tree
              </h2>
              <p className="mx-auto mt-4 max-w-xl font-body text-lg text-cream-300">
                Start free, set up in five minutes, and send your first offer today.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
                <Link href="https://app.podiumpersonnel.com/signup" className="btn-accent-dynamic group text-base">
                  Start Free Trial
                  <ChevronRight className="ml-1 w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-cream-100/20 px-6 py-3 font-body font-medium text-cream-100 transition-colors hover:border-cream-100/40"
                >
                  View pricing
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Heading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mx-auto max-w-2xl text-center">
      <span className="eyebrow accent-text before:accent-bg justify-center">{eyebrow}</span>
      <h2 className="mt-4 font-display text-3xl md:text-display-md font-semibold text-ink-800 tracking-tight text-balance">
        {title}
      </h2>
    </motion.div>
  );
}
