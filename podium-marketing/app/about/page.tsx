"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronRight,
  Heart,
  Target,
  Lightbulb,
  Users,
  Music,
  Clock,
  Shield,
} from "lucide-react";

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

const values = [
  {
    icon: Heart,
    title: "Musicians First",
    description:
      "Every feature we build starts with one question: does this make life easier for musicians and the people who work with them?",
  },
  {
    icon: Target,
    title: "Simple Over Complex",
    description:
      "Enterprise software is powerful but overwhelming. We believe the best tools are the ones you can use without a manual.",
  },
  {
    icon: Lightbulb,
    title: "Built by Musicians",
    description:
      "We've been in your shoes—managing rosters, chasing payments, sending endless emails. We built what we wish existed.",
  },
  {
    icon: Shield,
    title: "Honest & Transparent",
    description:
      "No hidden fees, no surprise charges, no dark patterns. We earn your trust by being straightforward about everything.",
  },
];

const timeline = [
  {
    year: "2022",
    title: "The Frustration",
    description:
      "After one too many lost spreadsheets and payment mix-ups, we started sketching what better musician management could look like.",
  },
  {
    year: "2023",
    title: "The First Version",
    description:
      "Launched with a handful of beta users—string quartets and chamber groups who were willing to try something new.",
  },
  {
    year: "2024",
    title: "Growing Pains",
    description:
      "Expanded to regional orchestras. Built the musician portal based on feedback. Learned a lot about what actually matters.",
  },
  {
    year: "2025",
    title: "The Platform",
    description:
      "Thousands of musicians, hundreds of ensembles, and a platform that finally delivers on the original vision.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-gradient-radial from-brass-200/30 via-transparent to-transparent opacity-60" />
          {/* Musical staff line decorations */}
          {[...Array(5)].map((_, i) => (
            <div
              key={`staff-hero-${i}`}
              className="absolute left-0 right-0 h-px bg-ink-900 opacity-[0.04]"
              style={{ top: `${30 + i * 3}%` }}
            />
          ))}
        </div>

        <div className="container-marketing">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="max-w-3xl"
          >
            <motion.div variants={fadeInUp}>
              <div className="w-20 h-1 bg-gradient-to-r from-brass-400 to-brass-200 rounded-full mb-6" />
              <div className="decorative-line mb-6" />
            </motion.div>
            <motion.h1
              variants={fadeInUp}
              className="font-display text-display-lg md:text-display-xl text-ink-900 mb-6"
            >
              We&apos;ve been in your shoes.
            </motion.h1>
            <motion.p
              variants={fadeInUp}
              className="font-body text-xl text-ink-500 leading-relaxed"
            >
              Podium Personnel was built by people who&apos;ve actually managed
              musicians—and got tired of the chaos.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Story Section */}
      <section className="section-padding bg-white">
        <div className="container-marketing">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={fadeInUp}
            >
              <h2 className="font-display text-display-sm md:text-display-md text-ink-900 mb-6">
                Our Story
              </h2>
              <div className="space-y-6 font-body text-lg text-ink-600 leading-relaxed">
                <p>
                  We&apos;ve sent the 2am &ldquo;can anyone sub tomorrow?&rdquo; texts.
                  We&apos;ve lost track of who&apos;s been paid. We&apos;ve watched great
                  musicians slip through the cracks because our &ldquo;system&rdquo;
                  was a mess of spreadsheets and memory.
                </p>
                <p>
                  Enterprise orchestra software exists, but it costs tens of
                  thousands and takes months to implement. Band booking apps exist,
                  but they&apos;re built for rock bands and DJs, not chamber musicians
                  and orchestras.
                </p>
                <p>
                  So we built Podium: modern, affordable, and designed specifically
                  for the classical and acoustic world—string quartets, chamber
                  ensembles, regional orchestras, and anyone who contracts musicians
                  for performances.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <div className="bg-cream-100 rounded-2xl p-8 md:p-12 relative">
                <div className="aspect-square relative overflow-hidden rounded-xl">
                  {/* Background layer */}
                  <div className="absolute inset-0 bg-gradient-to-br from-brass-100 to-cream-200" />

                  {/* App mockup element */}
                  <div className="absolute top-8 left-6 right-10 bottom-16 bg-white rounded-xl shadow-lg border border-cream-200 z-10 p-4">
                    <div className="w-full h-3 bg-cream-100 rounded-full mb-3" />
                    <div className="w-3/4 h-3 bg-cream-100 rounded-full mb-6" />
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {[...Array(6)].map((_, i) => (
                        <div key={`mock-${i}`} className="h-8 bg-brass-50 rounded-lg" />
                      ))}
                    </div>
                    <div className="w-1/2 h-3 bg-cream-100 rounded-full" />
                  </div>

                  {/* Overlapping musical notation decorative elements */}
                  <div className="absolute -top-2 -right-4 w-40 h-28 bg-brass-200/60 rounded-2xl rotate-6 z-0" />
                  <div className="absolute top-4 -right-2 w-36 h-24 bg-brass-300/40 rounded-2xl -rotate-3 z-0" />
                  <div className="absolute -bottom-3 -left-3 w-36 h-24 bg-brass-100/80 rounded-2xl rotate-3 z-0" />

                  {/* Musical notation snippet decorative divs */}
                  <div className="absolute bottom-6 right-4 z-20 bg-cream-50/90 backdrop-blur-sm rounded-lg p-3 shadow-md border border-brass-100/50 rotate-2">
                    <div className="flex flex-col gap-1">
                      {[...Array(5)].map((_, i) => (
                        <div key={`notation-${i}`} className="w-16 h-px bg-ink-300/30" />
                      ))}
                    </div>
                    <Music className="w-5 h-5 text-brass-500 absolute top-2 right-2" />
                  </div>

                  {/* Brass accent circle */}
                  <div className="absolute top-6 right-8 w-10 h-10 bg-gradient-to-br from-brass-300 to-brass-500 rounded-full z-20 flex items-center justify-center shadow-md">
                    <Music className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
              {/* Decorative elements */}
              <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-brass-300/30 rounded-full blur-2xl" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="section-padding bg-ink-800 text-cream-50 relative overflow-hidden">
        {/* Musical staff line decorations */}
        {[...Array(5)].map((_, i) => (
          <div
            key={`staff-mission-${i}`}
            className="absolute left-0 right-0 h-px bg-cream-50 opacity-[0.04]"
            style={{ top: `${35 + i * 4}%` }}
          />
        ))}
        <div className="container-marketing relative z-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="max-w-3xl mx-auto text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-brass-500/20 text-brass-400 flex items-center justify-center mx-auto mb-4">
              <Target className="w-8 h-8" />
            </div>
            <div className="w-12 h-0.5 bg-gradient-to-r from-brass-400 to-brass-200 rounded-full mx-auto mb-8" />
            <h2 className="font-display text-display-md mb-6">Our Mission</h2>
            <p className="font-display text-2xl md:text-3xl text-cream-100 italic leading-relaxed">
              Make musician management so simple that you can spend your time on
              music, not admin.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Values Section */}
      <section className="section-padding bg-cream-100">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-16"
          >
            <h2 className="font-display text-display-sm md:text-display-md text-ink-900 mb-4">
              What We Believe
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto"
          >
            {values.map((value) => (
              <motion.div key={value.title} variants={fadeInUp} className="card group relative hover:border-brass-200/60 transition-colors duration-300">
                {/* Decorative brass dot accent */}
                <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-brass-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="w-12 h-12 rounded-xl bg-brass-100 text-brass-600 flex items-center justify-center mb-5">
                  <value.icon className="w-6 h-6" />
                </div>
                <h3 className="font-display text-xl text-ink-800 mb-3">
                  {value.title}
                </h3>
                <p className="font-body text-ink-500 leading-relaxed">
                  {value.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="section-padding bg-white">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-16"
          >
            <h2 className="font-display text-display-sm md:text-display-md text-ink-900 mb-4">
              Our Journey
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="max-w-3xl mx-auto"
          >
            {timeline.map((item, index) => (
              <motion.div
                key={item.year}
                variants={fadeInUp}
                className="flex gap-8 pb-12 last:pb-0"
              >
                {/* Year */}
                <div className="flex-shrink-0 w-20">
                  <span className="font-display text-2xl text-brass-500">
                    {item.year}
                  </span>
                </div>

                {/* Timeline line */}
                <div className="relative flex-shrink-0">
                  {/* Subtle glow behind dot */}
                  <div className="absolute -inset-1 bg-brass-300/30 rounded-full blur-md" />
                  <div className="relative w-4 h-4 bg-brass-400 rounded-full animate-pulse-soft" />
                  {index !== timeline.length - 1 && (
                    <div className="absolute top-4 left-1.5 w-1 h-full bg-gradient-to-b from-brass-300 to-brass-100" />
                  )}
                </div>

                {/* Content */}
                <div className="pb-8">
                  <h3 className="font-display text-xl text-ink-800 mb-2">
                    {item.title}
                  </h3>
                  <p className="font-body text-ink-500 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="section-padding bg-cream-100">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
          >
            {[
              { value: "2,400+", label: "Musicians" },
              { value: "350+", label: "Ensembles" },
              { value: "15,000+", label: "Gigs booked" },
              { value: "98%", label: "Customer retention" },
            ].map((stat) => (
              <motion.div key={stat.label} variants={fadeInUp} className="text-center bg-cream-50 border border-cream-200 rounded-2xl p-6">
                <p className="font-display text-display-sm md:text-display-md text-gradient-brass mb-2">
                  {stat.value}
                </p>
                <p className="font-body text-ink-500">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Team Section Placeholder */}
      <section className="section-padding bg-white">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-16"
          >
            <h2 className="font-display text-display-sm md:text-display-md text-ink-900 mb-4">
              Built by Musicians, for Musicians
            </h2>
            <p className="font-body text-lg text-ink-500 max-w-2xl mx-auto">
              Our team combines decades of experience in classical music performance,
              arts administration, and software engineering.
            </p>
          </motion.div>

        </div>
      </section>

      {/* CTA Section */}
      <section className="section-padding bg-gradient-to-br from-ink-800 via-ink-800 to-ink-900 text-cream-50 relative overflow-hidden">
        {/* Musical staff line decorations */}
        {[...Array(5)].map((_, i) => (
          <div
            key={`staff-cta-${i}`}
            className="absolute left-0 right-0 h-px bg-cream-50 opacity-[0.04]"
            style={{ top: `${25 + i * 5}%` }}
          />
        ))}
        <div className="container-marketing relative z-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="max-w-3xl mx-auto text-center"
          >
            <div className="w-16 h-0.5 bg-gradient-to-r from-brass-400 to-brass-200 rounded-full mx-auto mb-8" />
            <h2 className="font-display text-display-md mb-6">
              Ready to join us?
            </h2>
            <p className="font-body text-xl text-cream-300 mb-10 leading-relaxed">
              Whether you&apos;re a quartet or a symphony, we&apos;d love to help you
              spend less time on admin and more time on music.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
              <Link href="https://app.podiumpersonnel.com/signup" className="btn-accent text-lg px-8 py-4">
                Start Free Trial
                <ChevronRight className="ml-2 w-5 h-5" />
              </Link>
            </div>

            {/* Glass-morphism trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-cream-50/5 border border-cream-100/10 rounded-full backdrop-blur-sm">
                <Shield className="w-4 h-4 text-brass-400" />
                <span className="font-body text-sm text-cream-200">No credit card required</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-cream-50/5 border border-cream-100/10 rounded-full backdrop-blur-sm">
                <Clock className="w-4 h-4 text-brass-400" />
                <span className="font-body text-sm text-cream-200">14-day free trial</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-cream-50/5 border border-cream-100/10 rounded-full backdrop-blur-sm">
                <Users className="w-4 h-4 text-brass-400" />
                <span className="font-body text-sm text-cream-200">350+ ensembles trust us</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
