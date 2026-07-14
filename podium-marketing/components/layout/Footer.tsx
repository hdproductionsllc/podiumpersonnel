import Link from "next/link";
import { VERTICALS } from "@/lib/verticals";

const footerLinks = {
  product: [
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Integrations", href: "/features#integrations" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Privacy Policy", href: "/privacy" },
  ],
};

export function Footer() {
  return (
    <footer className="bg-curtain-800 text-cream-100 relative">
      {/* Brass accent line at top */}
      <div className="h-px bg-gradient-to-r from-transparent via-brass-500/50 to-transparent" />

      {/* Main Footer */}
      <div className="container-marketing section-padding">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-4">
            <Link href="/" className="flex items-center gap-3 mb-6 group">
              <div className="w-10 h-10 bg-cream-100 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                <span className="font-display italic font-bold text-2xl text-ink-800 leading-none -mt-0.5">P</span>
              </div>
              <span className="font-display font-semibold text-xl">Podium</span>
            </Link>
            <p className="text-cream-300 font-body text-sm leading-relaxed max-w-xs mb-8">
              The personnel platform for performing-arts organizations — for the
              people who&apos;d rather make the art than chase the roster.
            </p>
            <Link
              href="https://app.podiumpersonnel.com/signup"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brass-500/20 border border-brass-500/30 rounded-full text-sm font-body text-brass-300 hover:bg-brass-500/30 hover:text-brass-200 transition-all duration-300"
            >
              Start your free trial
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Who it's for */}
          <div className="md:col-span-4">
            <h3 className="font-display font-semibold text-cream-50 mb-4 text-sm uppercase tracking-wider">
              Who it&apos;s for
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {VERTICALS.map((v) => (
                <li key={v.slug}>
                  <Link
                    href={`/for/${v.slug}`}
                    className="text-sm text-cream-400 hover:text-brass-300 transition-colors duration-300"
                  >
                    {v.navLabel}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Product */}
          <div className="md:col-span-2">
            <h3 className="font-display font-semibold text-cream-50 mb-4 text-sm uppercase tracking-wider">
              Product
            </h3>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-cream-400 hover:text-brass-300 transition-colors duration-300">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div className="md:col-span-2">
            <h3 className="font-display font-semibold text-cream-50 mb-4 text-sm uppercase tracking-wider">
              Company
            </h3>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-cream-400 hover:text-brass-300 transition-colors duration-300">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-cream-100/10">
        <div className="container-marketing py-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-cream-500">
            © {new Date().getFullYear()} Podium Personnel. All rights reserved.
          </p>
          <p className="text-sm text-cream-500">
            Made with care for the performing arts.
          </p>
        </div>
      </div>
    </footer>
  );
}
