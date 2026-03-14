"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ChevronRight } from "lucide-react";

const navLinks = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
];

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-500 ${
          isScrolled
            ? "bg-cream-100/90 backdrop-blur-md shadow-sm"
            : "bg-transparent"
        }`}
      >
        <nav className="container-marketing">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="w-10 h-10 bg-ink-800 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                  <span className="font-display italic font-bold text-2xl text-cream-50 leading-none -mt-0.5">P</span>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-brass-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
              <span className="font-display font-semibold text-xl text-ink-800">
                Podium
              </span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="relative font-body text-ink-600 hover:text-ink-800 transition-colors duration-300 py-2 group"
                >
                  {link.label}
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-brass-400 transition-all duration-300 group-hover:w-full" />
                </Link>
              ))}
            </div>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-4">
              <Link
                href="https://app.podiumpersonnel.com/login"
                className="font-body text-ink-600 hover:text-ink-800 transition-colors duration-300"
              >
                Sign In
              </Link>
              <Link href="https://app.podiumpersonnel.com/signup" className="btn-primary group">
                Start Free Trial
                <ChevronRight className="ml-1 w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-ink-800 hover:bg-cream-200 rounded-lg transition-colors"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-30 md:hidden"
          >
            <div
              className="absolute inset-0 bg-ink-900/20 backdrop-blur-sm"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <motion.nav
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="absolute top-20 left-4 right-4 bg-white rounded-2xl shadow-xl border border-cream-200 overflow-hidden"
            >
              <div className="p-6 space-y-4">
                {navLinks.map((link, index) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.05 }}
                  >
                    <Link
                      href={link.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block py-3 px-4 text-lg font-body text-ink-700 hover:text-ink-900 hover:bg-cream-100 rounded-lg transition-colors"
                    >
                      {link.label}
                    </Link>
                  </motion.div>
                ))}
                <div className="pt-4 border-t border-cream-200 space-y-3">
                  <Link
                    href="https://app.podiumpersonnel.com/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block py-3 px-4 text-center font-body text-ink-600 hover:text-ink-800 transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="https://app.podiumpersonnel.com/signup"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="btn-primary w-full justify-center"
                  >
                    Start Free Trial
                    <ChevronRight className="ml-1 w-4 h-4" />
                  </Link>
                </div>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
