"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Users,
  Send,
  Calendar,
  CreditCard,
  RefreshCw,
  Smartphone,
  Search,
  Tag,
  Clock,
  Bell,
  CheckCircle2,
  FileText,
  Upload,
  BarChart3,
  Shield,
  Zap,
  ArrowRight,
  ChevronRight,
  Mail,
  Download,
  Settings,
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

const features = [
  {
    id: "roster",
    icon: Users,
    title: "Roster Management",
    headline: "Your entire roster, finally in one place.",
    description:
      "Stop digging through spreadsheets and old emails. Podium keeps every musician's info organized and searchable.",
    subfeatures: [
      {
        icon: Search,
        title: "Smart Search",
        description:
          "Find musicians instantly by instrument, location, availability, or custom tags.",
      },
      {
        icon: Tag,
        title: "Custom Tags",
        description:
          "Organize your roster your way with flexible tagging—first call, section leaders, subs, and more.",
      },
      {
        icon: Upload,
        title: "Easy Import",
        description:
          "Upload from Excel or CSV in seconds. No tedious manual entry required.",
      },
      {
        icon: BarChart3,
        title: "Call Order",
        description:
          "Set priority rankings so you always know who to call first for each chair.",
      },
    ],
  },
  {
    id: "offers",
    icon: Send,
    title: "Contract Offers",
    headline: "Send offers they'll actually respond to.",
    description:
      'No more "per my last email." Podium makes it embarrassingly easy for musicians to say yes.',
    subfeatures: [
      {
        icon: Zap,
        title: "One-Click Sending",
        description:
          "Select musician, select project, send. It's that simple.",
      },
      {
        icon: Smartphone,
        title: "Mobile-Friendly",
        description:
          "Musicians accept or decline from their phone in 30 seconds.",
      },
      {
        icon: Clock,
        title: "Expiration Dates",
        description:
          "Create urgency and get faster responses with offer deadlines.",
      },
      {
        icon: Bell,
        title: "Smart Reminders",
        description:
          "Automatic gentle nudges for pending offers so you don't have to chase.",
      },
    ],
  },
  {
    id: "staffing",
    icon: Calendar,
    title: "Project Staffing",
    headline: "See your whole project at a glance.",
    description:
      "Visual staffing that makes sense. Know exactly who's confirmed, who's pending, and who you still need.",
    subfeatures: [
      {
        icon: Users,
        title: "Drag-and-Drop",
        description:
          "Assign musicians to positions with a click. Reorder as needed.",
      },
      {
        icon: Settings,
        title: "Ensemble Presets",
        description:
          "Save your go-to quartet or orchestra configuration and reuse it instantly.",
      },
      {
        icon: CheckCircle2,
        title: "Status at a Glance",
        description:
          "Color-coded indicators show confirmed, offered, and vacant positions.",
      },
      {
        icon: Bell,
        title: "Conflict Warnings",
        description:
          "Know immediately if someone's double-booked before you send an offer.",
      },
    ],
  },
  {
    id: "payments",
    icon: CreditCard,
    title: "Payment Tracking",
    headline: "Know exactly who's been paid.",
    description:
      "Stop guessing. Stop digging through Venmo. Podium tracks every payment so you don't have to.",
    subfeatures: [
      {
        icon: FileText,
        title: "Per-Service Tracking",
        description:
          "Track payment status for every service—unpaid, pending, or paid.",
      },
      {
        icon: Download,
        title: "QuickBooks Export",
        description:
          "One-click export in QuickBooks-ready format for seamless accounting.",
      },
      {
        icon: CreditCard,
        title: "Payment Preferences",
        description:
          "Store each musician's preferred payment method—Zelle, check, direct deposit.",
      },
      {
        icon: BarChart3,
        title: "Full Audit Trail",
        description:
          "Complete history of every payment for your records and theirs.",
      },
    ],
  },
  {
    id: "portal",
    icon: Smartphone,
    title: "Musician Portal",
    headline: "Give your musicians superpowers.",
    description:
      "Every musician gets free access to a portal that makes their life easier—and yours.",
    subfeatures: [
      {
        icon: Calendar,
        title: "Unified Calendar",
        description:
          "All gigs from all groups in one view. No more juggling multiple sources.",
      },
      {
        icon: CheckCircle2,
        title: "Instant Responses",
        description:
          "Accept or decline offers in seconds without email back-and-forth.",
      },
      {
        icon: Download,
        title: "Calendar Sync",
        description:
          "Auto-sync to Google Calendar, iCal, or Outlook with one click.",
      },
      {
        icon: Settings,
        title: "Profile Management",
        description:
          "Musicians update their own contact info, instruments, and preferences.",
      },
    ],
  },
  {
    id: "subs",
    icon: RefreshCw,
    title: "Substitutions",
    headline: "Handle subs without losing your mind.",
    description:
      "Conflicts happen. Podium makes finding coverage painless for everyone.",
    subfeatures: [
      {
        icon: Users,
        title: "Musician-Initiated",
        description:
          "Musicians can request subs through the portal instead of texting you.",
      },
      {
        icon: CheckCircle2,
        title: "Approval Workflow",
        description:
          "You stay in control—approve or modify every substitution request.",
      },
      {
        icon: Mail,
        title: "Auto Notifications",
        description:
          "Everyone stays informed automatically when subs are arranged.",
      },
      {
        icon: FileText,
        title: "Full History",
        description:
          "Track who subbed for whom, when, and why for complete records.",
      },
    ],
  },
];

// Mini-mockup visuals for each feature section
const featureVisuals: Record<string, React.ReactNode> = {
  roster: (
    <div className="bg-gradient-to-br from-cream-50 to-cream-100 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-brass-500" />
          <span className="text-xs font-body font-semibold text-ink-700">Musician Roster</span>
        </div>
        <div className="h-6 w-16 bg-brass-100 rounded-md flex items-center justify-center text-[10px] font-body text-brass-600">+ Add</div>
      </div>
      {/* Header row */}
      <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-body font-medium text-ink-400 uppercase tracking-wider">
        <div className="col-span-4">Name</div>
        <div className="col-span-3">Instrument</div>
        <div className="col-span-3">Phone</div>
        <div className="col-span-2">Status</div>
      </div>
      {[
        { name: "Sarah Martinez", instrument: "Violin I", phone: "(555) 0142", status: "Active", statusColor: "bg-green-100 text-green-700" },
        { name: "James Chen", instrument: "Viola", phone: "(555) 0198", status: "Active", statusColor: "bg-green-100 text-green-700" },
        { name: "Emily Ross", instrument: "Cello", phone: "(555) 0234", status: "On Leave", statusColor: "bg-amber-100 text-amber-700" },
        { name: "Michael Park", instrument: "Violin II", phone: "(555) 0311", status: "Active", statusColor: "bg-green-100 text-green-700" },
        { name: "Lisa Wang", instrument: "Bass", phone: "(555) 0456", status: "Sub", statusColor: "bg-blue-100 text-blue-700" },
      ].map((row) => (
        <div key={row.name} className="grid grid-cols-12 gap-2 items-center bg-white rounded-lg px-3 py-2.5 border border-cream-200">
          <div className="col-span-4 flex items-center gap-2">
            <div className="w-6 h-6 bg-brass-100 rounded-full flex items-center justify-center text-[9px] font-bold text-brass-700">{row.name.split(" ").map(n => n[0]).join("")}</div>
            <span className="text-xs font-body font-medium text-ink-800 truncate">{row.name}</span>
          </div>
          <div className="col-span-3 text-[11px] font-body text-ink-500">{row.instrument}</div>
          <div className="col-span-3 text-[11px] font-body text-ink-400">{row.phone}</div>
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
        <span className="text-xs font-body font-semibold text-ink-700">Contract Offer</span>
      </div>
      <div className="bg-white rounded-xl border border-cream-200 overflow-hidden">
        {/* Offer header */}
        <div className="bg-ink-800 px-5 py-4">
          <div className="text-[10px] font-body text-cream-400 mb-1">PODIUM</div>
          <div className="text-sm font-display font-semibold text-cream-50">Henderson Wedding Quartet</div>
          <div className="text-[11px] font-body text-cream-300 mt-1">Westlake Ensemble</div>
        </div>
        {/* Offer details */}
        <div className="p-5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-body text-ink-400">Date</span>
            <span className="text-xs font-body font-medium text-ink-700">Sat, March 15, 2025</span>
          </div>
          <div className="h-px bg-cream-200" />
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-body text-ink-400">Time</span>
            <span className="text-xs font-body font-medium text-ink-700">4:00 PM - 7:00 PM</span>
          </div>
          <div className="h-px bg-cream-200" />
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-body text-ink-400">Venue</span>
            <span className="text-xs font-body font-medium text-ink-700">Ritz-Carlton Ballroom</span>
          </div>
          <div className="h-px bg-cream-200" />
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-body text-ink-400">Position</span>
            <span className="text-xs font-body font-medium text-ink-700">Violin I</span>
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
          <Calendar className="w-4 h-4 text-brass-500" />
          <span className="text-xs font-body font-semibold text-ink-700">Project Staffing</span>
        </div>
        <span className="text-[10px] font-body text-ink-400">Henderson Wedding</span>
      </div>
      <div className="space-y-2">
        {[
          { position: "Violin I", musician: "Sarah Martinez", status: "confirmed", color: "bg-green-100 border-green-200 text-green-700" },
          { position: "Violin II", musician: "Michael Park", status: "pending", color: "bg-amber-100 border-amber-200 text-amber-700" },
          { position: "Viola", musician: "James Chen", status: "confirmed", color: "bg-green-100 border-green-200 text-green-700" },
          { position: "Cello", musician: "", status: "vacant", color: "bg-cream-200 border-cream-300 text-ink-400" },
        ].map((row) => (
          <div key={row.position} className={`flex items-center gap-3 bg-white rounded-lg px-4 py-3 border ${row.status === "confirmed" ? "border-green-200" : row.status === "pending" ? "border-amber-200" : "border-dashed border-cream-300"}`}>
            <div className="w-20 text-[11px] font-body font-medium text-ink-700">{row.position}</div>
            <div className="flex-1">
              {row.musician ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-brass-100 rounded-full flex items-center justify-center text-[8px] font-bold text-brass-700">{row.musician.split(" ").map(n => n[0]).join("")}</div>
                  <span className="text-xs font-body text-ink-700">{row.musician}</span>
                </div>
              ) : (
                <span className="text-[11px] font-body text-ink-400 italic">Needs assignment</span>
              )}
            </div>
            <span className={`text-[9px] font-body font-medium px-2 py-0.5 rounded-full border ${row.color}`}>
              {row.status === "confirmed" ? "Confirmed" : row.status === "pending" ? "Pending" : "Vacant"}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4 text-[10px] font-body text-ink-400">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-400" /> Confirmed</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-400" /> Pending</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-cream-300" /> Vacant</div>
      </div>
    </div>
  ),
  payments: (
    <div className="bg-gradient-to-br from-cream-50 to-cream-100 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-brass-500" />
          <span className="text-xs font-body font-semibold text-ink-700">Payment Tracking</span>
        </div>
        <div className="h-6 w-20 bg-ink-800 rounded-md flex items-center justify-center text-[10px] font-body text-cream-50">Export</div>
      </div>
      <div className="space-y-2">
        {/* Header row */}
        <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-body font-medium text-ink-400 uppercase tracking-wider">
          <div className="col-span-4">Musician</div>
          <div className="col-span-3">Service</div>
          <div className="col-span-2 text-right">Amount</div>
          <div className="col-span-3 text-right">Status</div>
        </div>
        {[
          { name: "Sarah Martinez", service: "Mar 15 Wedding", amount: "$350", status: "Paid", statusColor: "bg-green-100 text-green-700" },
          { name: "James Chen", service: "Mar 15 Wedding", amount: "$350", status: "Paid", statusColor: "bg-green-100 text-green-700" },
          { name: "Michael Park", service: "Mar 15 Wedding", amount: "$350", status: "Pending", statusColor: "bg-amber-100 text-amber-700" },
          { name: "Lisa Wang", service: "Mar 22 Gala", amount: "$400", status: "Unpaid", statusColor: "bg-red-50 text-red-600" },
          { name: "Emily Ross", service: "Mar 22 Gala", amount: "$400", status: "Pending", statusColor: "bg-amber-100 text-amber-700" },
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
        <div className="bg-ink-900 rounded-[2rem] p-2.5 shadow-xl">
          <div className="bg-cream-50 rounded-[1.6rem] overflow-hidden">
            {/* Phone notch */}
            <div className="h-6 bg-cream-50 flex items-center justify-center">
              <div className="w-16 h-4 bg-ink-900 rounded-full" />
            </div>
            {/* Screen content */}
            <div className="p-3 pb-5 bg-cream-50">
              <div className="mb-4">
                <p className="text-[9px] text-ink-400 mb-0.5 font-body">Welcome back,</p>
                <p className="text-sm font-display font-semibold text-ink-800">Sarah Martinez</p>
              </div>
              {/* Upcoming */}
              <p className="text-[9px] font-medium text-ink-500 mb-2 font-body uppercase tracking-wide">Upcoming</p>
              <div className="space-y-2">
                {[
                  { date: "Mar 15", title: "Henderson Wedding", group: "Westlake Ensemble" },
                  { date: "Mar 22", title: "Spring Gala", group: "Meridian Quartet" },
                  { date: "Apr 5", title: "Corporate Event", group: "Westlake Ensemble" },
                ].map((gig) => (
                  <div key={gig.title} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-cream-200">
                    <div className="w-9 h-9 bg-brass-100 rounded-md flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-[8px] text-brass-600 font-medium">{gig.date.split(" ")[0]}</span>
                      <span className="text-[11px] font-bold text-brass-700">{gig.date.split(" ")[1]}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-ink-800 truncate">{gig.title}</p>
                      <p className="text-[9px] text-ink-400">{gig.group}</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Quick action */}
              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-2 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                <span className="text-[10px] font-body text-green-700">New offer waiting - tap to view</span>
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
            <div className="w-8 h-8 bg-brass-100 rounded-full flex items-center justify-center text-[10px] font-bold text-brass-700">JC</div>
            <div>
              <p className="text-xs font-body font-medium text-ink-800">James Chen</p>
              <p className="text-[10px] font-body text-ink-400">Viola - Mar 22 Spring Gala</p>
            </div>
          </div>
          <p className="text-[10px] font-body text-ink-500 mt-2 italic">&ldquo;Family commitment - need coverage&rdquo;</p>
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
          <p className="text-[10px] font-body text-ink-500">Sub approved. Contacting available musicians...</p>
        </div>
        {/* Step 3: Filled */}
        <div className="bg-white rounded-xl border border-blue-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">3</div>
            <span className="text-[11px] font-body font-semibold text-ink-700">Sub Confirmed</span>
          </div>
          <div className="flex items-center gap-3 bg-blue-50 rounded-lg p-2.5">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-[10px] font-bold text-blue-700">LW</div>
            <div>
              <p className="text-xs font-body font-medium text-ink-800">Lisa Wang</p>
              <p className="text-[10px] font-body text-ink-400">Accepted sub for Viola</p>
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
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-radial from-brass-200/30 via-transparent to-transparent opacity-60" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-radial from-cream-300/50 via-transparent to-transparent" />
          {/* Musical staff lines - subtle */}
          <div className="absolute top-[30%] left-[8%] w-[25%] flex flex-col gap-2 opacity-[0.04]">
            {[...Array(5)].map((_, i) => (
              <div key={`hero-staff-l-${i}`} className="h-px bg-ink-800" />
            ))}
          </div>
          <div className="absolute top-[60%] right-[6%] w-[20%] flex flex-col gap-2 opacity-[0.03]">
            {[...Array(5)].map((_, i) => (
              <div key={`hero-staff-r-${i}`} className="h-px bg-ink-800" />
            ))}
          </div>
        </div>

        <div className="container-marketing">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="max-w-3xl"
          >
            {/* Brass gradient decorative line above heading */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="w-16 h-0.5 bg-gradient-to-r from-brass-400 to-brass-500 mb-6 rounded-full origin-left"
            />
            <motion.h1
              variants={fadeInUp}
              className="font-display text-display-lg md:text-display-xl text-ink-900 mb-6"
            >
              Everything you need to manage your musicians.
            </motion.h1>
            <motion.p
              variants={fadeInUp}
              className="font-body text-xl text-ink-500 leading-relaxed"
            >
              From first contact to final payment, Podium handles the details so
              you can focus on the music.
            </motion.p>
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
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
              className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center"
            >
              {/* Content */}
              <motion.div
                variants={fadeInUp}
                className={index % 2 === 1 ? "lg:order-2" : ""}
              >
                <div className="w-14 h-14 rounded-2xl bg-brass-100 text-brass-600 flex items-center justify-center mb-6">
                  <feature.icon className="w-7 h-7" />
                </div>
                <h2 className="font-display text-display-sm md:text-display-md text-ink-900 mb-4">
                  {feature.headline}
                </h2>
                <p className="font-body text-lg text-ink-500 mb-8 leading-relaxed">
                  {feature.description}
                </p>

                <div className="grid sm:grid-cols-2 gap-6">
                  {feature.subfeatures.map((sub) => (
                    <div key={sub.title} className="flex gap-4">
                      <div className="w-10 h-10 rounded-xl bg-cream-200 text-ink-600 flex items-center justify-center flex-shrink-0">
                        <sub.icon className="w-5 h-5" />
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
                variants={fadeInUp}
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
      <section id="integrations" className="section-padding bg-ink-800 text-cream-50 relative">
        {/* Decorative brass line divider at top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-0.5 bg-gradient-to-r from-transparent via-brass-400 to-transparent" />
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-16"
          >
            <h2 className="font-display text-display-md mb-4">
              Works with tools you already use.
            </h2>
            <p className="font-body text-lg text-cream-300 max-w-2xl mx-auto">
              Podium integrates seamlessly with your existing workflow.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto"
          >
            {[
              { name: "Google Calendar", icon: Calendar },
              { name: "Apple iCal", icon: Calendar },
              { name: "QuickBooks", icon: BarChart3 },
              { name: "Excel/CSV", icon: FileText },
            ].map((integration) => (
              <motion.div
                key={integration.name}
                variants={fadeInUp}
                className="flex flex-col items-center gap-3 p-6 bg-ink-700/50 rounded-xl border border-ink-600/30 hover:bg-ink-600/50 hover:-translate-y-0.5 hover:border-brass-500/30 transition-all duration-300 cursor-default"
              >
                <integration.icon className="w-8 h-8 text-brass-400" />
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
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid lg:grid-cols-2 gap-12 items-center"
          >
            <motion.div variants={fadeInUp}>
              <div className="w-14 h-14 rounded-2xl bg-ink-800 text-cream-50 flex items-center justify-center mb-6">
                <Shield className="w-7 h-7" />
              </div>
              <h2 className="font-display text-display-sm md:text-display-md text-ink-900 mb-4">
                Your data is safe with us.
              </h2>
              <p className="font-body text-lg text-ink-500 mb-8 leading-relaxed">
                We take security seriously. Your roster, your payments, your
                business—all protected with enterprise-grade security.
              </p>

              <ul className="space-y-4">
                {[
                  "256-bit SSL encryption",
                  "SOC 2 Type II compliant infrastructure",
                  "Daily encrypted backups",
                  "99.9% uptime SLA",
                  "GDPR compliant",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-brass-500 flex-shrink-0" />
                    <span className="font-body text-ink-600">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <div className="relative">
                <div className="bg-white rounded-2xl shadow-xl shadow-ink-900/5 border border-cream-200 p-8 md:p-12">
                  <div className="aspect-square bg-gradient-to-br from-ink-50 to-ink-100 rounded-xl flex flex-col items-center justify-center gap-6 p-8">
                    <Shield className="w-16 h-16 text-ink-300" />
                    {/* Security visual elements */}
                    <div className="w-full space-y-3">
                      {[
                        { label: "Encryption", value: "AES-256", color: "bg-green-100 text-green-700" },
                        { label: "Uptime", value: "99.9%", color: "bg-blue-100 text-blue-700" },
                        { label: "Compliance", value: "SOC 2", color: "bg-brass-100 text-brass-700" },
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
              Ready to see it in action?
            </motion.h2>
            <motion.p variants={fadeInUp} className="font-body text-xl text-cream-300 mb-10 leading-relaxed">
              Start your 14-day free trial today. No credit card required. Set up in under 5 minutes.
            </motion.p>

            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
              <Link href="https://app.podiumpersonnel.com/signup" className="btn-accent text-lg px-8 py-4 group">
                Start Free Trial
                <ChevronRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/pricing" className="inline-flex items-center justify-center px-8 py-4 text-lg font-body font-medium text-cream-50 rounded-lg border-2 border-cream-300/30 transition-all duration-300 hover:border-cream-50 hover:bg-cream-50/10 hover:-translate-y-0.5">
                View Pricing
              </Link>
            </motion.div>

            {/* Trust badges - glass-morphism */}
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
