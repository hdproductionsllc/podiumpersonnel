"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronRight,
  Mail,
  FileSpreadsheet,
  DollarSign,
  MessageSquare,
  Users,
  Send,
  Calendar,
  CreditCard,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  Star,
  Zap,
  Clock,
  Shield,
} from "lucide-react";

// Animation variants
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

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-44 md:pb-36 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-radial from-brass-200/30 via-transparent to-transparent opacity-60" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-radial from-cream-300/50 via-transparent to-transparent" />
          {/* Musical staff lines - subtle */}
          <div className="absolute top-[35%] left-[10%] w-[30%] flex flex-col gap-2 opacity-[0.04]">
            {[...Array(5)].map((_, i) => (
              <div key={`staff-l-${i}`} className="h-px bg-ink-800" />
            ))}
          </div>
          <div className="absolute top-[55%] right-[8%] w-[25%] flex flex-col gap-2 opacity-[0.03]">
            {[...Array(5)].map((_, i) => (
              <div key={`staff-r-${i}`} className="h-px bg-ink-800" />
            ))}
          </div>
        </div>

        <div className="container-marketing">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brass-100/80 border border-brass-200 rounded-full mb-8 backdrop-blur-sm"
            >
              <span className="w-2 h-2 bg-brass-500 rounded-full animate-pulse-soft" />
              <span className="text-sm font-body text-brass-700 tracking-wide">
                Now with free Musician Portal
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-display-lg md:text-display-xl text-ink-900 mb-4"
            >
              Stop chasing musicians.
            </motion.h1>
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-display-lg md:text-display-xl mb-8"
            >
              <span className="text-gradient-brass italic">
                Start making music.
              </span>
            </motion.h1>

            {/* Decorative brass line */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="w-16 h-0.5 bg-gradient-to-r from-brass-400 to-brass-500 mx-auto mb-8 rounded-full"
            />

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="font-body text-xl md:text-2xl text-ink-500 mb-10 max-w-2xl mx-auto leading-relaxed"
            >
              The simple way to manage your roster, send gig offers, and track
              payments. Built for quartets, ensembles, and orchestras.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link href="https://app.podiumpersonnel.com/signup" className="btn-primary text-lg px-8 py-4 group">
                Start Free Trial
                <ChevronRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="#demo" className="btn-secondary text-lg px-8 py-4">
                See How It Works
              </Link>
            </motion.div>

            {/* Trust indicators */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="mt-8 flex items-center justify-center gap-6 text-sm text-ink-400 font-body"
            >
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-brass-500" />
                14-day free trial
              </span>
              <span className="w-1 h-1 bg-ink-300 rounded-full" />
              <span>No credit card required</span>
              <span className="w-1 h-1 bg-ink-300 rounded-full hidden sm:block" />
              <span className="hidden sm:inline">Set up in 5 minutes</span>
            </motion.div>
          </div>

          {/* Hero Image/Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mt-16 md:mt-24 relative"
          >
            <div className="relative mx-auto max-w-5xl">
              {/* Glow behind the browser */}
              <div className="absolute -inset-8 bg-gradient-radial from-brass-300/20 via-transparent to-transparent blur-2xl" />

              {/* Browser frame */}
              <div className="relative bg-white rounded-2xl shadow-2xl shadow-ink-900/15 border border-cream-200 overflow-hidden">
                {/* Browser bar */}
                <div className="flex items-center gap-2 px-4 py-3 bg-cream-50 border-b border-cream-200">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-burgundy-400" />
                    <div className="w-3 h-3 rounded-full bg-brass-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-cream-200 rounded-md px-3 py-1.5 text-sm text-ink-500 font-body max-w-md mx-auto flex items-center gap-2 justify-center">
                      <Shield className="w-3 h-3 text-green-500" />
                      app.podiumpersonnel.com
                    </div>
                  </div>
                </div>
                {/* Dashboard mockup matching the actual app design */}
                <div className="flex">
                  {/* Sidebar mockup - deep navy */}
                  <div className="hidden md:flex w-56 flex-col bg-ink-800 p-4">
                    <div className="h-12 w-28 bg-cream-100/10 rounded mx-auto mb-6" />
                    <div className="space-y-1">
                      {["Dashboard", "Projects", "Musicians", "Ensembles", "Payments", "Venues", "Schedules"].map((item, i) => (
                        <div key={item} className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-body ${
                          i === 1 ? "bg-ink-700 border-l-2 border-brass-400 text-brass-400" : "text-cream-400/50"
                        }`}>
                          <div className={`w-4 h-4 rounded ${i === 1 ? "bg-brass-400/20" : "bg-ink-600"}`} />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Main content area - warm cream */}
                  <div className="flex-1 bg-cream-100 p-6 md:p-8">
                    {/* Header bar */}
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <div className="h-5 w-40 bg-ink-200 rounded mb-1.5" style={{ fontFamily: "serif" }} />
                        <div className="h-3 w-56 bg-cream-300 rounded" />
                        <div className="h-0.5 w-10 bg-brass-400/50 rounded mt-2" />
                      </div>
                      <div className="flex gap-2">
                        <div className="h-8 w-8 bg-ink-800 rounded-full" />
                      </div>
                    </div>
                    {/* Stats row */}
                    <div className="grid grid-cols-4 gap-3 mb-6">
                      {["3", "24", "5", "8"].map((num, i) => (
                        <div key={i} className="bg-white rounded-lg border border-cream-200 p-3 shadow-sm">
                          <div className="h-2 w-12 bg-ink-200/40 rounded mb-2" />
                          <div className="text-lg font-bold text-ink-800 font-display">{num}</div>
                          <div className="h-2 w-16 bg-cream-300 rounded mt-1" />
                        </div>
                      ))}
                    </div>
                    {/* Content */}
                    <div className="bg-white rounded-lg border border-cream-200 shadow-sm p-4">
                      <div className="flex items-center gap-4 p-3 bg-brass-50/50 rounded-md mb-3 border border-brass-100">
                        <div className="w-8 h-8 bg-brass-200 rounded-full" />
                        <div className="flex-1">
                          <div className="h-3 w-28 bg-ink-200 rounded mb-1.5" />
                          <div className="h-2 w-40 bg-cream-300 rounded" />
                        </div>
                        <div className="h-6 w-16 bg-green-100 text-green-700 rounded-full text-[10px] flex items-center justify-center font-medium">Accepted</div>
                      </div>
                      {[1, 2].map((i) => (
                        <div key={i} className="flex items-center gap-4 p-3 rounded-md">
                          <div className="w-8 h-8 bg-cream-200 rounded-full" />
                          <div className="flex-1">
                            <div className="h-3 w-24 bg-ink-100 rounded mb-1.5" />
                            <div className="h-2 w-36 bg-cream-200 rounded" />
                          </div>
                          <div className={`h-6 w-16 ${i === 1 ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"} rounded-full text-[10px] flex items-center justify-center font-medium`}>
                            {i === 1 ? "Pending" : "Viewed"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating elements */}
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -left-4 md:-left-12 top-1/4 bg-white rounded-xl shadow-lg p-4 border border-cream-200"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-800">Offer Accepted</p>
                    <p className="text-xs text-ink-400">Sarah M. • Just now</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute -right-4 md:-right-8 top-1/3 bg-white rounded-xl shadow-lg p-4 border border-cream-200"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brass-100 rounded-full flex items-center justify-center">
                    <Send className="w-5 h-5 text-brass-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-800">4 Offers Sent</p>
                    <p className="text-xs text-ink-400">Henderson Wedding</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pain Points Section */}
      <section className="section-padding bg-white relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cream-300 to-transparent" />

        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-16"
          >
            <div className="decorative-line mx-auto mb-6" />
            <h2 className="font-display text-display-md text-ink-900 mb-4">
              Sound familiar?
            </h2>
            <p className="font-body text-lg text-ink-500 max-w-2xl mx-auto">
              Managing musicians shouldn&apos;t feel like a second full-time job.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto"
          >
            {[
              {
                icon: Mail,
                title: "The Email Spiral",
                description:
                  '"Can you play Saturday?" turns into 47 reply-all threads. You\'re CC\'ing people who already declined. Nobody knows who\'s confirmed.',
                color: "burgundy",
              },
              {
                icon: FileSpreadsheet,
                title: "The Spreadsheet Nightmare",
                description:
                  'Your "master roster" lives in three different Google Sheets, a Notes app, and someone\'s head. Good luck finding who plays viola da gamba.',
                color: "brass",
              },
              {
                icon: DollarSign,
                title: "The Payment Chase",
                description:
                  '"Did I pay Sarah for the Johnson wedding?" You\'re digging through Venmo history at 11pm trying to figure out who\'s still owed money.',
                color: "burgundy",
              },
              {
                icon: MessageSquare,
                title: "The Text Message Avalanche",
                description:
                  'Your phone buzzes constantly. "What time Saturday?" "Where do I park?" "Can someone sub for me?" You\'ve become a 24/7 help desk.',
                color: "brass",
              },
            ].map((pain, index) => (
              <motion.div
                key={pain.title}
                variants={fadeInUp}
                className="relative p-8 rounded-2xl bg-cream-50 border border-cream-200 hover:border-brass-200/60 hover:shadow-lg hover:shadow-ink-900/5 hover:-translate-y-0.5 transition-all duration-300 group"
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${
                    pain.color === "burgundy"
                      ? "bg-burgundy-100 text-burgundy-600"
                      : "bg-brass-100 text-brass-600"
                  }`}
                >
                  <pain.icon className="w-6 h-6" />
                </div>
                <h3 className="font-display text-xl text-ink-800 mb-3">
                  {pain.title}
                </h3>
                <p className="font-body text-ink-500 leading-relaxed">
                  {pain.description}
                </p>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center mt-16"
          >
            <div className="decorative-line mx-auto mb-6" />
            <p className="font-display text-display-sm text-ink-800 italic">
              There&apos;s a better way.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Solution Section */}
      <section id="demo" className="section-padding bg-cream-100 scroll-mt-20">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.div variants={fadeInUp} className="decorative-line mx-auto mb-6" />
            <motion.h2 variants={fadeInUp} className="font-display text-display-md text-ink-900 mb-4">
              One place for everything.
            </motion.h2>
            <motion.p variants={fadeInUp} className="font-body text-lg text-ink-500 max-w-2xl mx-auto">
              From first contact to final payment, Podium handles the details so
              you can focus on the music.
            </motion.p>
          </motion.div>

          <div className="space-y-24">
            {[
              {
                icon: Users,
                title: "Your Roster, Finally Organized",
                description:
                  "Import your musicians in minutes. Track instruments, contact info, payment preferences, and W-9 status. Filter by section, region, or custom tags. Find your first-call cellist in seconds, not hours.",
                features: [
                  "Smart profiles with all the details",
                  "Powerful search and filtering",
                  "Call order rankings",
                  "Custom tags and notes",
                ],
                align: "left",
              },
              {
                icon: Send,
                title: "Offers They Actually Respond To",
                description:
                  "Send professional contract offers with one click. Musicians see the dates, venue, pay—and accept or decline right from their phone. No more \"did you get my email?\"",
                features: [
                  "One-click offer sending",
                  "Mobile-friendly responses",
                  "Automatic reminders",
                  "Full tracking and history",
                ],
                align: "right",
              },
              {
                icon: Calendar,
                title: "Staffing Made Visual",
                description:
                  "See who's booked, who's available, who hasn't responded. Drag-and-drop to fill chairs. Save your go-to lineups as presets. Staff a full quartet in under a minute.",
                features: [
                  "Visual staffing grid",
                  "Saved ensemble presets",
                  "Availability indicators",
                  "Conflict warnings",
                ],
                align: "left",
              },
              {
                icon: CreditCard,
                title: "Payments You Can Actually Track",
                description:
                  "Know exactly who's been paid and who's waiting. Export to QuickBooks. Send payment confirmations automatically. No more \"I think I Zelle'd you?\"",
                features: [
                  "Per-service tracking",
                  "QuickBooks export",
                  "Payment preferences stored",
                  "Full audit trail",
                ],
                align: "right",
              },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={fadeInUp}
                className={`flex flex-col ${
                  feature.align === "right" ? "lg:flex-row-reverse" : "lg:flex-row"
                } items-center gap-12 lg:gap-20`}
              >
                {/* Content */}
                <div className="flex-1">
                  <div className="w-14 h-14 rounded-2xl bg-brass-100 text-brass-600 flex items-center justify-center mb-6">
                    <feature.icon className="w-7 h-7" />
                  </div>
                  <h3 className="font-display text-display-sm text-ink-900 mb-4">
                    {feature.title}
                  </h3>
                  <p className="font-body text-lg text-ink-500 mb-6 leading-relaxed">
                    {feature.description}
                  </p>
                  <ul className="space-y-3">
                    {feature.features.map((item) => (
                      <li key={item} className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-brass-500 flex-shrink-0" />
                        <span className="font-body text-ink-600">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Visual */}
                <div className="flex-1 w-full">
                  <div className="relative">
                    <div className="bg-white rounded-2xl shadow-xl shadow-ink-900/5 border border-cream-200 p-6 md:p-8">
                      <div className="aspect-[4/3] bg-gradient-to-br from-cream-50 to-cream-100 rounded-xl p-4 md:p-6 flex flex-col">
                        {/* Mini feature mockup header */}
                        <div className="flex items-center gap-2 mb-4">
                          <feature.icon className="w-5 h-5 text-brass-500" />
                          <div className="h-3 w-24 bg-ink-200 rounded" />
                          <div className="ml-auto h-2 w-12 bg-cream-300 rounded" />
                        </div>
                        {/* Mini mockup rows */}
                        <div className="space-y-2.5 flex-1">
                          {[1, 2, 3, 4].map((row) => (
                            <div key={row} className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-cream-200/50">
                              <div className={`w-7 h-7 rounded-full ${row === 1 ? "bg-brass-100" : "bg-cream-200"}`} />
                              <div className="flex-1">
                                <div className={`h-2.5 rounded ${row === 1 ? "w-24 bg-ink-200" : row === 2 ? "w-20 bg-ink-100" : row === 3 ? "w-28 bg-ink-100" : "w-16 bg-ink-100"}`} />
                                <div className="h-2 w-16 bg-cream-300 rounded mt-1" />
                              </div>
                              <div className={`h-5 w-14 rounded-full text-[9px] flex items-center justify-center font-medium ${
                                row === 1 ? "bg-green-100 text-green-700" : row === 2 ? "bg-blue-100 text-blue-700" : row === 3 ? "bg-amber-100 text-amber-700" : "bg-cream-200 text-ink-400"
                              }`}>
                                {row === 1 ? "Active" : row === 2 ? "Sent" : row === 3 ? "Pending" : "Draft"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Decorative glow */}
                    <div
                      className={`absolute -z-10 w-32 h-32 bg-brass-200/50 rounded-full blur-2xl ${
                        feature.align === "right" ? "-left-8 -bottom-8" : "-right-8 -bottom-8"
                      }`}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Musician Portal Section */}
      <section className="section-padding bg-ink-800 text-cream-50 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-radial from-brass-500/10 via-transparent to-transparent" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-gradient-radial from-ink-600/50 via-transparent to-transparent" />
        </div>

        <div className="container-marketing">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={fadeInUp}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-brass-500/20 border border-brass-500/30 rounded-full mb-6">
                <Zap className="w-4 h-4 text-brass-400" />
                <span className="text-sm font-body text-brass-300">
                  Always free for musicians
                </span>
              </div>

              <h2 className="font-display text-display-md mb-6">
                Your musicians will thank you.
              </h2>

              <p className="font-body text-xl text-cream-300 mb-8 leading-relaxed">
                Every musician gets free access to their own portal. One login to
                see gigs from every group they work with.
              </p>

              <ul className="space-y-4 mb-10">
                {[
                  "See all upcoming services in one calendar",
                  "Accept or decline offers instantly",
                  "Set payment preferences once, use everywhere",
                  "Sync schedule to Google Calendar or iCal",
                  "Request subs when conflicts come up",
                  "Access from any device—phone, tablet, laptop",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-brass-400 flex-shrink-0 mt-0.5" />
                    <span className="font-body text-cream-200">{item}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/features"
                className="inline-flex items-center gap-2 font-body text-brass-400 hover:text-brass-300 transition-colors group"
              >
                Learn more about the Musician Portal
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              {/* Phone mockup */}
              <div className="relative mx-auto w-[280px] md:w-[320px]">
                <div className="bg-ink-900 rounded-[3rem] p-3 shadow-2xl">
                  <div className="bg-cream-50 rounded-[2.5rem] overflow-hidden">
                    {/* Phone notch */}
                    <div className="h-8 bg-cream-50 flex items-center justify-center">
                      <div className="w-20 h-5 bg-ink-900 rounded-full" />
                    </div>
                    {/* Screen content */}
                    <div className="p-4 pb-8 bg-cream-50">
                      <div className="mb-6">
                        <p className="text-xs text-ink-400 mb-1 font-body">
                          Welcome back,
                        </p>
                        <p className="text-lg font-display font-semibold text-ink-800">
                          Sarah Martinez
                        </p>
                      </div>

                      {/* Upcoming section */}
                      <div className="mb-4">
                        <p className="text-xs font-medium text-ink-500 mb-3 font-body uppercase tracking-wide">
                          Upcoming
                        </p>
                        <div className="space-y-3">
                          {[
                            { date: "Jan 28", title: "Henderson Wedding", group: "Subito Strings" },
                            { date: "Feb 3", title: "Corporate Event", group: "Project SQ" },
                            { date: "Feb 14", title: "Valentine's Gala", group: "Subito Strings" },
                          ].map((gig) => (
                            <div
                              key={gig.title}
                              className="flex items-center gap-3 p-3 bg-white rounded-xl border border-cream-200"
                            >
                              <div className="w-12 h-12 bg-brass-100 rounded-lg flex flex-col items-center justify-center">
                                <span className="text-[10px] text-brass-600 font-medium">
                                  {gig.date.split(" ")[0]}
                                </span>
                                <span className="text-sm font-bold text-brass-700">
                                  {gig.date.split(" ")[1]}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-ink-800 truncate">
                                  {gig.title}
                                </p>
                                <p className="text-xs text-ink-400">{gig.group}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating notification */}
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -right-4 top-1/4 bg-white rounded-xl shadow-lg p-3 border border-cream-200"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-ink-800">
                        Synced to Calendar
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>

          {/* Testimonial */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="mt-20 pt-16 border-t border-ink-700"
          >
            <blockquote className="max-w-3xl mx-auto text-center">
              <p className="font-display text-2xl md:text-3xl text-cream-100 italic leading-relaxed mb-6">
                &ldquo;I used to get texts from 6 different contractors asking the
                same questions. Now I just check Podium and everything&apos;s
                there.&rdquo;
              </p>
              <footer className="flex items-center justify-center gap-4">
                <div className="w-12 h-12 bg-brass-500/30 rounded-full flex items-center justify-center">
                  <span className="font-display text-lg text-brass-300">S</span>
                </div>
                <div className="text-left">
                  <cite className="font-body text-cream-200 not-italic font-medium">
                    Sarah M.
                  </cite>
                  <p className="text-sm text-cream-400">Freelance Violinist</p>
                </div>
              </footer>
            </blockquote>
          </motion.div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="section-padding bg-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cream-300 to-transparent" />
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.div variants={fadeInUp} className="decorative-line mx-auto mb-6" />
            <motion.h2 variants={fadeInUp} className="font-display text-display-md text-ink-900 mb-4">
              Trusted by ensembles who&apos;d rather play than administrate.
            </motion.h2>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 mb-16"
          >
            {[
              { value: "2,400+", label: "Musicians managed" },
              { value: "15,000+", label: "Offers sent" },
              { value: "94%", label: "Response rate" },
              { value: "4.9/5", label: "Average rating" },
            ].map((stat) => (
              <motion.div key={stat.label} variants={fadeInUp} className="text-center p-6 rounded-2xl bg-cream-50 border border-cream-200">
                <p className="font-display text-display-sm md:text-display-md text-gradient-brass mb-2">
                  {stat.value}
                </p>
                <p className="font-body text-sm text-ink-500 uppercase tracking-wider">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Testimonials */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-3 gap-8"
          >
            {[
              {
                quote:
                  "We went from spending 10 hours a week on admin to about 2. Podium paid for itself in the first month.",
                author: "Chamber ensemble director",
                location: "Los Angeles",
              },
              {
                quote:
                  "I can staff an entire concert series from my phone while waiting for soundcheck. Game changer.",
                author: "String quartet manager",
                location: "Chicago",
              },
              {
                quote:
                  "Our musicians actually respond to offers now. The portal makes it so easy they have no excuse.",
                author: "Regional orchestra personnel",
                location: "Minneapolis",
              },
            ].map((testimonial, index) => (
              <motion.div key={index} variants={fadeInUp} className="card">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-brass-400 text-brass-400" />
                  ))}
                </div>
                <blockquote className="font-body text-ink-600 mb-6 leading-relaxed">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>
                <footer>
                  <p className="font-body font-medium text-ink-800">
                    {testimonial.author}
                  </p>
                  <p className="text-sm text-ink-400">{testimonial.location}</p>
                </footer>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pricing Preview Section */}
      <section className="section-padding bg-cream-100">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.div variants={fadeInUp} className="decorative-line mx-auto mb-6" />
            <motion.h2 variants={fadeInUp} className="font-display text-display-md text-ink-900 mb-4">
              Simple pricing. No surprises.
            </motion.h2>
            <motion.p variants={fadeInUp} className="font-body text-lg text-ink-500 max-w-2xl mx-auto">
              Start free, upgrade when you&apos;re ready. Musicians always free.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto"
          >
            {/* Free Plan */}
            <motion.div
              variants={fadeInUp}
              className="relative rounded-2xl p-8 bg-white border border-cream-200 hover:border-brass-200/60 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              <h3 className="font-display text-xl text-ink-800 mb-2">Free</h3>
              <div className="mb-4">
                <span className="font-display text-display-sm text-ink-900">$0</span>
                <span className="text-ink-400">/month</span>
              </div>
              <p className="font-body text-sm text-ink-500 mb-6">
                Everything you need to start managing your roster and sending offers.
              </p>

              <ul className="space-y-3 mb-8">
                {[
                  "Up to 25 musicians",
                  "3 active projects",
                  "Contract offers & tracking",
                  "Payment tracking",
                  "Musician portal access",
                  "Email support",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-brass-500" />
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
              className="relative rounded-2xl p-8 bg-ink-800 text-cream-50 shadow-xl shadow-ink-900/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-brass-500 text-white text-sm font-body font-medium rounded-full">
                14-Day Free Trial
              </div>

              <h3 className="font-display text-xl text-cream-50 mb-2">Pro</h3>
              <div className="mb-4">
                <span className="font-display text-display-sm text-cream-50">$29</span>
                <span className="text-cream-300">/month</span>
              </div>
              <p className="font-body text-sm text-cream-300 mb-6">
                Unlimited everything. For busy contractors and growing ensembles.
              </p>

              <ul className="space-y-3 mb-8">
                {[
                  "Unlimited musicians",
                  "Unlimited projects",
                  "Unlimited admin seats",
                  "Bulk roster import",
                  "Saved ensemble presets",
                  "Gig details & group messaging",
                  "Portal invites & W-9 requests",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-brass-400" />
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

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center mt-8 text-sm text-ink-400 font-body"
          >
            14-day Pro trial on every new account. No credit card required.
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center mt-6"
          >
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 font-body text-ink-600 hover:text-ink-800 transition-colors group"
            >
              Compare all features
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Final CTA Section */}
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

            <motion.h2 variants={fadeInUp} className="font-display text-display-md md:text-display-lg mb-6">
              Ready to get your time back?
            </motion.h2>
            <motion.p variants={fadeInUp} className="font-body text-xl text-cream-300 mb-10 leading-relaxed">
              Start your 14-day free trial. No credit card required. Set up in
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
