"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  Users,
  Send,
  LayoutGrid,
  Wallet,
  Smartphone,
  RefreshCw,
  Search,
  Tag,
  Upload,
  ListOrdered,
  Zap,
  Clock,
  Bell,
  CheckCircle2,
  FileText,
  Download,
  CreditCard,
  BarChart3,
  Calendar,
  Settings,
  Mail,
  Shield,
  ChevronRight,
} from "lucide-react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const features = [
  {
    id: "roster",
    icon: Users,
    title: "Personnel",
    headline: "Your entire roster, finally in one place.",
    description:
      "Stop digging through spreadsheets and old email threads. Podium keeps every performer's details organized and searchable — however you seat, cast, or section your people.",
    subfeatures: [
      {
        icon: Search,
        title: "Smart Search",
        description:
          "Find performers instantly by role, section, voice part, location, or your own tags.",
      },
      {
        icon: Tag,
        title: "Custom Tags",
        description:
          "Organize your roster your way — first-call, section leaders, covers, subs, and more.",
      },
      {
        icon: Upload,
        title: "Easy Import",
        description:
          "Upload from Excel or CSV in seconds. No tedious manual entry required.",
      },
      {
        icon: ListOrdered,
        title: "Call Order",
        description:
          "Set priority rankings so you always know who to offer first for each seat, role, or part.",
      },
    ],
  },
  {
    id: "offers",
    icon: Send,
    title: "Offers",
    headline: "Send offers they'll actually answer.",
    description:
      'No more "per my last email." Podium makes it effortless for performers to say yes — dates, place, and pay all in one tap, and the offer cascades to the next name when someone passes.',
    subfeatures: [
      {
        icon: Zap,
        title: "One-Click Sending",
        description:
          "Pick the person, pick the project, send. It's genuinely that simple.",
      },
      {
        icon: Smartphone,
        title: "Answer From Any Phone",
        description:
          "Performers accept or decline in 30 seconds. No app, no login required.",
      },
      {
        icon: Clock,
        title: "Expiration Dates",
        description:
          "Create gentle urgency and get faster answers with offer deadlines.",
      },
      {
        icon: Bell,
        title: "Smart Reminders",
        description:
          "Automatic nudges for pending offers, so you're not the one chasing.",
      },
    ],
  },
  {
    id: "staffing",
    icon: LayoutGrid,
    title: "Staffing",
    headline: "See your whole production at a glance.",
    description:
      "Visual staffing that makes sense. Know exactly who's confirmed, who's pending, and which seats, roles, or parts you still need to fill.",
    subfeatures: [
      {
        icon: Users,
        title: "Fill Every Position",
        description:
          "Assign performers to chairs, roles, or voice parts with a click. Reorder as needed.",
      },
      {
        icon: Settings,
        title: "Reusable Presets",
        description:
          "Save your go-to lineup — a quartet, a worship team, a full section — and reuse it instantly.",
      },
      {
        icon: CheckCircle2,
        title: "Status at a Glance",
        description:
          "Color-coded indicators show confirmed, offered, and open positions.",
      },
      {
        icon: Bell,
        title: "Conflict Warnings",
        description:
          "Know immediately if someone's double-booked before you send the offer.",
      },
    ],
  },
  {
    id: "payments",
    icon: Wallet,
    title: "Payments",
    headline: "Know exactly who's been paid.",
    description:
      "Stop guessing. Stop reconstructing a payment app at midnight. Podium tracks every payment — and the W-9s and 1099s behind it.",
    subfeatures: [
      {
        icon: FileText,
        title: "Per-Service Tracking",
        description:
          "Track payment status for every service — unpaid, pending, or paid.",
      },
      {
        icon: Download,
        title: "W-9s & 1099 Export",
        description:
          "Collect W-9s on file and export clean, tax-ready totals when the year wraps.",
      },
      {
        icon: CreditCard,
        title: "Payment Preferences",
        description:
          "Store each performer's preferred method — Zelle, check, direct deposit.",
      },
      {
        icon: BarChart3,
        title: "Full Audit Trail",
        description:
          "A complete history of every payment, for your records and theirs.",
      },
    ],
  },
  {
    id: "portal",
    icon: Smartphone,
    title: "Performer Portal",
    headline: "Give your performers a home base.",
    description:
      "Every performer gets free access to a portal that makes their life easier — and yours. One login for every group they play, sing, or dance for.",
    subfeatures: [
      {
        icon: Calendar,
        title: "Unified Calendar",
        description:
          "Every booking from every group in one view. No juggling separate sources.",
      },
      {
        icon: CheckCircle2,
        title: "Instant Responses",
        description:
          "Accept or decline offers in seconds without the email back-and-forth.",
      },
      {
        icon: Download,
        title: "Calendar Sync",
        description:
          "Auto-sync to Google Calendar, Apple, or Outlook with one click.",
      },
      {
        icon: Settings,
        title: "Profile Management",
        description:
          "Performers keep their own contact info, roles, and pay preferences up to date.",
      },
    ],
  },
  {
    id: "subs",
    icon: RefreshCw,
    title: "Substitutions",
    headline: "Handle covers without losing your mind.",
    description:
      "Conflicts and injuries happen. Podium makes finding coverage painless for everyone — with a clean record of who stepped in.",
    subfeatures: [
      {
        icon: Users,
        title: "Performer-Initiated",
        description:
          "Performers request a sub through the portal instead of texting you at midnight.",
      },
      {
        icon: CheckCircle2,
        title: "Approval Workflow",
        description:
          "You stay in control — approve or adjust every substitution request.",
      },
      {
        icon: Mail,
        title: "Auto Notifications",
        description:
          "Everyone's kept in the loop automatically once a cover is arranged.",
      },
      {
        icon: FileText,
        title: "Full History",
        description:
          "Track who covered for whom, when, and why — a complete record.",
      },
    ],
  },
];

// Mini-mockup visuals for each feature section — art-form-varied sample data
const featureVisuals: Record<string, React.ReactNode> = {
  roster: (
    <div className="bg-gradient-to-br from-cream-50 to-cream-100 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-brass-500" />
          <span className="text-xs font-body font-semibold text-ink-700">Roster</span>
        </div>
        <div className="h-6 w-16 bg-brass-100 rounded-md flex items-center justify-center text-[10px] font-body text-brass-600">+ Add</div>
      </div>
      {/* Header row */}
      <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-body font-medium text-ink-400 uppercase tracking-wider">
        <div className="col-span-4">Name</div>
        <div className="col-span-4">Role</div>
        <div className="col-span-2">Phone</div>
        <div className="col-span-2">Status</div>
      </div>
      {[
        { name: "Priya Nair", role: "Principal Cello", phone: "0142", status: "Active", statusColor: "bg-green-100 text-green-700" },
        { name: "Marcus Tate", role: "Lead Vocalist", phone: "0198", status: "Active", statusColor: "bg-green-100 text-green-700" },
        { name: "Ana Gomez", role: "Soprano · Sec. Leader", phone: "0234", status: "On Leave", statusColor: "bg-amber-100 text-amber-700" },
        { name: "Devon Reyes", role: "Stage Manager", phone: "0311", status: "Active", statusColor: "bg-green-100 text-green-700" },
        { name: "Jordan Kim", role: "DJ", phone: "0456", status: "Sub", statusColor: "bg-blue-100 text-blue-700" },
      ].map((row) => (
        <div key={row.name} className="grid grid-cols-12 gap-2 items-center bg-white rounded-lg px-3 py-2.5 border border-cream-200">
          <div className="col-span-4 flex items-center gap-2">
            <div className="w-6 h-6 bg-brass-100 rounded-full flex items-center justify-center text-[9px] font-bold text-brass-700">{row.name.split(" ").map(n => n[0]).join("")}</div>
            <span className="text-xs font-body font-medium text-ink-800 truncate">{row.name}</span>
          </div>
          <div className="col-span-4 text-[11px] font-body text-ink-500 truncate">{row.role}</div>
          <div className="col-span-2 text-[11px] font-body text-ink-400">{row.phone}</div>
          <div className="col-span-2">
            <span className={`text-[9px] font-body font-medium px-2 py-0.5 rounded-full ${row.statusColor}`}>{row.status}</span>
          </div>
        </div>
      ))}
    </div>
  ),
  offers: (
    <div className="bg-gradient-to-br from-cream-50 to-cream-100 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Send className="w-4 h-4 text-brass-500" />
        <span className="text-xs font-body font-semibold text-ink-700">Offer</span>
      </div>
      <div className="bg-white rounded-xl border border-cream-200 overflow-hidden">
        {/* Offer header */}
        <div className="bg-ink-800 px-5 py-4">
          <div className="text-[10px] font-body text-cream-400 mb-1">PODIUM</div>
          <div className="text-sm font-display font-semibold text-cream-50">Spring Gala</div>
          <div className="text-[11px] font-body text-cream-300 mt-1">Meridian Ensemble</div>
        </div>
        {/* Offer details */}
        <div className="p-5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-body text-ink-400">Date</span>
            <span className="text-xs font-body font-medium text-ink-700">Sat, May 17, 2025</span>
          </div>
          <div className="h-px bg-cream-200" />
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-body text-ink-400">Time</span>
            <span className="text-xs font-body font-medium text-ink-700">7:00 PM Call</span>
          </div>
          <div className="h-px bg-cream-200" />
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-body text-ink-400">Venue</span>
            <span className="text-xs font-body font-medium text-ink-700">Riverside Ballroom</span>
          </div>
          <div className="h-px bg-cream-200" />
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-body text-ink-400">Position</span>
            <span className="text-xs font-body font-medium text-ink-700">Principal Cello</span>
          </div>
          <div className="h-px bg-cream-200" />
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-body text-ink-400">Pay</span>
            <span className="text-xs font-body font-semibold text-ink-800">$350.00</span>
          </div>
          {/* Action buttons */}
          <div className="flex gap-2 pt-3">
            <div className="flex-1 bg-green-600 text-white text-xs font-body font-medium py-2.5 rounded-lg text-center flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Accept
            </div>
            <div className="flex-1 bg-cream-200 text-ink-600 text-xs font-body font-medium py-2.5 rounded-lg text-center">
              Decline
            </div>
          </div>
          <div className="text-center text-[10px] font-body text-ink-400 pt-1">Expires in 3 days</div>
        </div>
      </div>
    </div>
  ),
  staffing: (
    <div className="bg-gradient-to-br from-cream-50 to-cream-100 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-brass-500" />
          <span className="text-xs font-body font-semibold text-ink-700">Production Staffing</span>
        </div>
        <span className="text-[10px] font-body text-ink-400">Spring Gala</span>
      </div>
      <div className="space-y-2">
        {[
          { position: "Principal Cello", performer: "Priya Nair", status: "confirmed", color: "bg-green-100 border-green-200 text-green-700" },
          { position: "Lead Vocalist", performer: "Marcus Tate", status: "pending", color: "bg-amber-100 border-amber-200 text-amber-700" },
          { position: "Soprano · Sec. Leader", performer: "Ana Gomez", status: "confirmed", color: "bg-green-100 border-green-200 text-green-700" },
          { position: "Stage Manager", performer: "", status: "vacant", color: "bg-cream-200 border-cream-300 text-ink-400" },
        ].map((row) => (
          <div key={row.position} className={`flex items-center gap-3 bg-white rounded-lg px-4 py-3 border ${row.status === "confirmed" ? "border-green-200" : row.status === "pending" ? "border-amber-200" : "border-dashed border-cream-300"}`}>
            <div className="w-28 text-[11px] font-body font-medium text-ink-700 truncate">{row.position}</div>
            <div className="flex-1">
              {row.performer ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-brass-100 rounded-full flex items-center justify-center text-[8px] font-bold text-brass-700">{row.performer.split(" ").map(n => n[0]).join("")}</div>
                  <span className="text-xs font-body text-ink-700 truncate">{row.performer}</span>
                </div>
              ) : (
                <span className="text-[11px] font-body text-ink-400 italic">Needs assignment</span>
              )}
            </div>
            <span className={`text-[9px] font-body font-medium px-2 py-0.5 rounded-full border ${row.color}`}>
              {row.status === "confirmed" ? "Confirmed" : row.status === "pending" ? "Pending" : "Open"}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4 text-[10px] font-body text-ink-400">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-400" /> Confirmed</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-400" /> Pending</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-cream-300" /> Open</div>
      </div>
    </div>
  ),
  payments: (
    <div className="bg-gradient-to-br from-cream-50 to-cream-100 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-brass-500" />
          <span className="text-xs font-body font-semibold text-ink-700">Payment Tracking</span>
        </div>
        <div className="h-6 w-20 bg-ink-800 rounded-md flex items-center justify-center text-[10px] font-body text-cream-50">Export</div>
      </div>
      <div className="space-y-2">
        {/* Header row */}
        <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-body font-medium text-ink-400 uppercase tracking-wider">
          <div className="col-span-4">Performer</div>
          <div className="col-span-3">Service</div>
          <div className="col-span-2 text-right">Amount</div>
          <div className="col-span-3 text-right">Status</div>
        </div>
        {[
          { name: "Priya Nair", service: "Spring Gala", amount: "$350", status: "Paid", statusColor: "bg-green-100 text-green-700" },
          { name: "Marcus Tate", service: "Spring Gala", amount: "$250", status: "Paid", statusColor: "bg-green-100 text-green-700" },
          { name: "Ana Gomez", service: "Messiah Run", amount: "$300", status: "Pending", statusColor: "bg-amber-100 text-amber-700" },
          { name: "Devon Reyes", service: "Nutcracker", amount: "$400", status: "Unpaid", statusColor: "bg-red-50 text-red-600" },
          { name: "Jordan Kim", service: "Corporate Event", amount: "$500", status: "Pending", statusColor: "bg-amber-100 text-amber-700" },
        ].map((row) => (
          <div key={`${row.name}-${row.service}`} className="grid grid-cols-12 gap-2 items-center bg-white rounded-lg px-3 py-2.5 border border-cream-200">
            <div className="col-span-4 text-xs font-body font-medium text-ink-800 truncate">{row.name}</div>
            <div className="col-span-3 text-[11px] font-body text-ink-500 truncate">{row.service}</div>
            <div className="col-span-2 text-xs font-body font-semibold text-ink-800 text-right">{row.amount}</div>
            <div className="col-span-3 text-right">
              <span className={`text-[9px] font-body font-medium px-2 py-0.5 rounded-full ${row.statusColor}`}>{row.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
  portal: (
    <div className="bg-gradient-to-br from-cream-50 to-cream-100 rounded-xl p-5 flex justify-center">
      {/* Phone mockup */}
      <div className="w-[220px]">
        <div className="bg-curtain-900 rounded-[2rem] p-2.5 shadow-xl">
          <div className="bg-cream-50 rounded-[1.6rem] overflow-hidden">
            {/* Phone notch */}
            <div className="h-6 bg-cream-50 flex items-center justify-center">
              <div className="w-16 h-4 bg-curtain-900 rounded-full" />
            </div>
            {/* Screen content */}
            <div className="p-3 pb-5 bg-cream-50">
              <div className="mb-4">
                <p className="text-[9px] text-ink-400 mb-0.5 font-body">Welcome back,</p>
                <p className="text-sm font-display font-semibold text-ink-800">Marcus Tate</p>
              </div>
              {/* Upcoming */}
              <p className="text-[9px] font-medium text-ink-500 mb-2 font-body uppercase tracking-wide">Upcoming</p>
              <div className="space-y-2">
                {[
                  { date: "May 17", title: "Spring Gala", group: "Meridian Ensemble" },
                  { date: "May 24", title: "Messiah — Dress", group: "City Chorale" },
                  { date: "Jun 5", title: "Corporate Event", group: "Bright Lights Agency" },
                ].map((booking) => (
                  <div key={booking.title} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-cream-200">
                    <div className="w-9 h-9 bg-brass-100 rounded-md flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-[8px] text-brass-600 font-medium">{booking.date.split(" ")[0]}</span>
                      <span className="text-[11px] font-bold text-brass-700">{booking.date.split(" ")[1]}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-ink-800 truncate">{booking.title}</p>
                      <p className="text-[9px] text-ink-400 truncate">{booking.group}</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Quick action */}
              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-2 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                <span className="text-[10px] font-body text-green-700">New offer waiting — tap to view</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
  subs: (
    <div className="bg-gradient-to-br from-cream-50 to-cream-100 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <RefreshCw className="w-4 h-4 text-brass-500" />
        <span className="text-xs font-body font-semibold text-ink-700">Substitution Request</span>
      </div>
      {/* Flow card */}
      <div className="space-y-3">
        {/* Step 1: Request */}
        <div className="bg-white rounded-xl border border-cream-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 bg-brass-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">1</div>
            <span className="text-[11px] font-body font-semibold text-ink-700">Sub Requested</span>
            <span className="text-[9px] font-body text-ink-400 ml-auto">2 hours ago</span>
          </div>
          <div className="flex items-center gap-3 bg-cream-50 rounded-lg p-2.5">
            <div className="w-8 h-8 bg-brass-100 rounded-full flex items-center justify-center text-[10px] font-bold text-brass-700">MT</div>
            <div>
              <p className="text-xs font-body font-medium text-ink-800">Marcus Tate</p>
              <p className="text-[10px] font-body text-ink-400">Lead Vocalist — May 17 Spring Gala</p>
            </div>
          </div>
          <p className="text-[10px] font-body text-ink-500 mt-2 italic">&ldquo;Family commitment — need coverage&rdquo;</p>
        </div>
        {/* Step 2: Approved */}
        <div className="bg-white rounded-xl border border-green-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">2</div>
            <span className="text-[11px] font-body font-semibold text-ink-700">Manager Approved</span>
            <span className="text-[9px] font-body text-green-600 ml-auto flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Approved
            </span>
          </div>
          <p className="text-[10px] font-body text-ink-500">Cover approved. Contacting available performers...</p>
        </div>
        {/* Step 3: Filled */}
        <div className="bg-white rounded-xl border border-blue-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">3</div>
            <span className="text-[11px] font-body font-semibold text-ink-700">Cover Confirmed</span>
          </div>
          <div className="flex items-center gap-3 bg-blue-50 rounded-lg p-2.5">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-[10px] font-bold text-blue-700">JK</div>
            <div>
              <p className="text-xs font-body font-medium text-ink-800">Jordan Kim</p>
              <p className="text-[10px] font-body text-ink-400">Accepted cover for Lead Vocalist</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
};

export default function FeaturesPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-cream-100 pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="pointer-events-none absolute inset-0 bg-spotlight opacity-70" aria-hidden />
        <div className="pointer-events-none absolute -top-24 right-0 h-[36rem] w-[36rem] rounded-full bg-gradient-radial from-brass-200/40 to-transparent blur-2xl" aria-hidden />

        <div className="container-marketing relative">
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger}
            className="max-w-3xl"
          >
            <motion.span variants={fadeUp} className="eyebrow">
              Everything Podium does
            </motion.span>
            <motion.h1
              variants={fadeUp}
              className="mt-5 font-display font-semibold text-ink-900 text-[2.75rem] leading-[1.05] sm:text-6xl lg:text-display-lg tracking-tight"
            >
              Everything you need to staff{" "}
              <span className="italic text-gradient-brass">the performing arts.</span>
            </motion.h1>
            <motion.div variants={fadeUp} className="mt-6 flex items-center gap-4">
              <span className="decorative-line" />
              <p className="max-w-xl font-body text-lg text-ink-500 leading-relaxed">
                From the first offer to the final payment, Podium handles the
                details of the call — so you can keep your attention on the work
                itself.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Feature Navigation */}
      <section className="sticky top-20 z-30 bg-cream-100/95 backdrop-blur-md border-b border-cream-200 shadow-sm shadow-ink-900/5">
        <div className="container-marketing">
          <nav className="flex gap-1 overflow-x-auto py-3 -mx-4 px-4 scrollbar-hide">
            {features.map((feature) => (
              <a
                key={feature.id}
                href={`#${feature.id}`}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-body font-medium text-ink-500 hover:text-brass-700 hover:bg-brass-50 border-b-2 border-transparent hover:border-brass-400 transition-all duration-200 whitespace-nowrap"
              >
                <feature.icon className="w-4 h-4 text-ink-400 group-hover:text-brass-500 transition-colors" />
                {feature.title}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* Feature Sections */}
      {features.map((feature, index) => (
        <section
          key={feature.id}
          id={feature.id}
          className={`section-padding ${index % 2 === 0 ? "bg-white" : "bg-cream-100"}`}
        >
          <div className="container-marketing">
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-100px" }}
              variants={stagger}
              className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center"
            >
              {/* Content */}
              <motion.div
                variants={fadeUp}
                className={index % 2 === 1 ? "lg:order-2" : ""}
              >
                <span className="eyebrow">{feature.title}</span>
                <div className="mt-5 w-14 h-14 rounded-2xl bg-brass-100 text-brass-600 flex items-center justify-center mb-6">
                  <feature.icon className="w-7 h-7" strokeWidth={1.6} />
                </div>
                <h2 className="font-display text-3xl md:text-display-md font-semibold text-ink-900 tracking-tight mb-4">
                  {feature.headline}
                </h2>
                <p className="font-body text-lg text-ink-500 mb-8 leading-relaxed">
                  {feature.description}
                </p>

                <div className="grid sm:grid-cols-2 gap-6">
                  {feature.subfeatures.map((sub) => (
                    <div key={sub.title} className="flex gap-4">
                      <div className="w-10 h-10 rounded-xl bg-cream-200 text-ink-600 flex items-center justify-center flex-shrink-0">
                        <sub.icon className="w-5 h-5" strokeWidth={1.6} />
                      </div>
                      <div>
                        <h3 className="font-body font-semibold text-ink-800 mb-1">
                          {sub.title}
                        </h3>
                        <p className="font-body text-sm text-ink-500">
                          {sub.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Visual */}
              <motion.div
                variants={fadeUp}
                className={index % 2 === 1 ? "lg:order-1" : ""}
              >
                <div className="relative">
                  <div className="bg-white rounded-2xl shadow-xl shadow-ink-900/5 border border-cream-200 p-4 md:p-6">
                    {featureVisuals[feature.id]}
                  </div>
                  {/* Decorative element */}
                  <div
                    className={`absolute -z-10 w-40 h-40 bg-brass-200/50 rounded-full blur-3xl ${
                      index % 2 === 0 ? "-right-10 -bottom-10" : "-left-10 -bottom-10"
                    }`}
                  />
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>
      ))}

      {/* Integration Section */}
      <section id="integrations" className="spotlight-stage section-padding text-cream-100">
        <div className="container-marketing relative">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeUp}
            className="mx-auto max-w-2xl text-center mb-16"
          >
            <span className="eyebrow justify-center !text-brass-400 before:!bg-brass-400/60">
              Fits your workflow
            </span>
            <h2 className="mt-4 font-display text-3xl md:text-display-md font-semibold text-cream-50 tracking-tight">
              Works with the tools you already use.
            </h2>
            <p className="mt-4 font-body text-lg text-cream-300 leading-relaxed">
              Podium slots into how your organization already runs — from the
              calendar your performers live in to the accounting you file at
              year-end.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={stagger}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto"
          >
            {[
              { name: "Google Calendar", icon: Calendar },
              { name: "Apple & Outlook", icon: Calendar },
              { name: "QuickBooks Export", icon: BarChart3 },
              { name: "Excel & CSV", icon: FileText },
            ].map((integration) => (
              <motion.div
                key={integration.name}
                variants={fadeUp}
                className="flex flex-col items-center gap-3 p-6 bg-cream-50/5 rounded-xl border border-cream-100/10 hover:bg-cream-50/10 hover:-translate-y-0.5 hover:border-brass-500/30 transition-all duration-300 cursor-default"
              >
                <integration.icon className="w-8 h-8 text-brass-400" strokeWidth={1.6} />
                <span className="font-body text-sm text-cream-200 text-center">
                  {integration.name}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Security Section */}
      <section className="section-padding bg-cream-100 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-[20%] right-[10%] w-[300px] h-[300px] bg-gradient-radial from-ink-100/30 via-transparent to-transparent" />
          <div className="absolute bottom-[10%] left-[5%] w-[200px] h-[200px] bg-gradient-radial from-brass-200/20 via-transparent to-transparent" />
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, #0F172A 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        </div>
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="grid lg:grid-cols-2 gap-12 items-center"
          >
            <motion.div variants={fadeUp}>
              <span className="eyebrow">Security & privacy</span>
              <div className="mt-5 w-14 h-14 rounded-2xl bg-curtain-800 text-cream-50 flex items-center justify-center mb-6">
                <Shield className="w-7 h-7" strokeWidth={1.6} />
              </div>
              <h2 className="font-display text-3xl md:text-display-md font-semibold text-ink-900 tracking-tight mb-4">
                Your data is safe with us.
              </h2>
              <p className="font-body text-lg text-ink-500 mb-8 leading-relaxed">
                Your roster, your performers, your payments — protected with
                modern security and handled with care. Your data is yours, and
                only yours.
              </p>

              <ul className="space-y-4">
                {[
                  "Encrypted in transit and at rest",
                  "Daily encrypted backups",
                  "Reliable, monitored uptime",
                  "Role-based access for your team",
                  "Your data is never sold or shared",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-brass-500 flex-shrink-0" />
                    <span className="font-body text-ink-600">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div variants={fadeUp}>
              <div className="relative">
                <div className="bg-white rounded-2xl shadow-xl shadow-ink-900/5 border border-cream-200 p-8 md:p-12">
                  <div className="aspect-square bg-gradient-to-br from-ink-50 to-ink-100 rounded-xl flex flex-col items-center justify-center gap-6 p-8">
                    <Shield className="w-16 h-16 text-ink-300" />
                    {/* Security visual elements */}
                    <div className="w-full space-y-3">
                      {[
                        { label: "Encryption", value: "AES-256", color: "bg-green-100 text-green-700" },
                        { label: "In transit", value: "TLS/SSL", color: "bg-blue-100 text-blue-700" },
                        { label: "Backups", value: "Daily", color: "bg-brass-100 text-brass-700" },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between bg-white/80 rounded-lg px-4 py-2.5 border border-cream-200">
                          <span className="text-xs font-body text-ink-500">{item.label}</span>
                          <span className={`text-[10px] font-body font-semibold px-2.5 py-0.5 rounded-full ${item.color}`}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Decorative element */}
                <div className="absolute -z-10 -right-8 -bottom-8 w-32 h-32 bg-ink-200/30 rounded-full blur-2xl" />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="spotlight-stage section-padding text-center text-cream-100">
        <div className="container-marketing relative">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={stagger}
            className="max-w-3xl mx-auto"
          >
            <motion.span
              variants={fadeUp}
              className="eyebrow justify-center !text-brass-400 before:!bg-brass-400/60"
            >
              Ready when you are
            </motion.span>

            <motion.h2
              variants={fadeUp}
              className="mt-5 font-display text-3xl md:text-display-lg font-semibold text-cream-50 tracking-tight"
            >
              See it in action.
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="mt-5 font-body text-xl text-cream-300 leading-relaxed"
            >
              Start your 14-day free trial today. No credit card required. Set up
              in under five minutes.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="https://app.podiumpersonnel.com/signup" className="btn-accent text-lg px-8 py-4 group">
                Start Free Trial
                <ChevronRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/pricing" className="inline-flex items-center justify-center px-8 py-4 text-lg font-body font-medium text-cream-50 rounded-lg border-2 border-cream-300/30 transition-all duration-300 hover:border-cream-50 hover:bg-cream-50/10 hover:-translate-y-0.5">
                View Pricing
              </Link>
            </motion.div>

            {/* Trust badges */}
            <motion.div variants={fadeUp} className="mt-10 flex flex-wrap items-center justify-center gap-3">
              {[
                { icon: Shield, text: "Bank-level security" },
                { icon: Clock, text: "Cancel anytime" },
                { icon: Zap, text: "5-minute setup" },
              ].map((badge) => (
                <span key={badge.text} className="glass-badge text-sm text-cream-300">
                  <badge.icon className="w-4 h-4 text-brass-400" />
                  {badge.text}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
