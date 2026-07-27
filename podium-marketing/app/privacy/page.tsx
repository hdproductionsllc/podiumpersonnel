"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const lastUpdated = "January 29, 2026";

export default function PrivacyPage() {
  return (
    <>
      {/* Header */}
      <section className="pt-32 pb-16 md:pt-40 md:pb-20 bg-cream-100">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            className="max-w-3xl mx-auto text-center"
          >
            <h1 className="font-display text-display-lg text-ink-900 mb-4">
              Privacy Policy
            </h1>
            <p className="font-body text-lg text-ink-500">
              Last updated: {lastUpdated}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <section className="section-padding bg-white">
        <div className="container-marketing">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="max-w-3xl mx-auto prose-policy"
          >
            <div className="space-y-12">
              {/* Introduction */}
              <div>
                <p className="font-body text-ink-600 leading-relaxed">
                  Podium Personnel (&ldquo;Podium,&rdquo; &ldquo;we,&rdquo;
                  &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is committed to
                  protecting your privacy. This Privacy Policy explains how we
                  collect, use, disclose, and safeguard your information when you
                  use our web application and related services (collectively, the
                  &ldquo;Service&rdquo;).
                </p>
                <p className="font-body text-ink-600 leading-relaxed mt-4">
                  By accessing or using the Service, you agree to this Privacy
                  Policy. If you do not agree, please do not use the Service.
                </p>
              </div>

              {/* 1 */}
              <div>
                <h2 className="font-display text-2xl text-ink-900 mb-4">
                  1. Information We Collect
                </h2>

                <h3 className="font-display text-lg text-ink-800 mb-2 mt-6">
                  Information You Provide
                </h3>
                <ul className="list-disc pl-6 space-y-2 font-body text-ink-600">
                  <li>
                    <strong>Account information:</strong> name, email address,
                    and password when you create an account.
                  </li>
                  <li>
                    <strong>Organization information:</strong> organization name,
                    timezone, and related details during onboarding.
                  </li>
                  <li>
                    <strong>Performer data:</strong> names, contact information,
                    skills and roles, payment preferences, and other details you
                    enter about performers in your roster.
                  </li>
                  <li>
                    <strong>Payment information:</strong> billing details
                    processed through our third-party payment processor. We do
                    not store credit card numbers on our servers.
                  </li>
                  <li>
                    <strong>Communications:</strong> any messages or information
                    you send us through support channels.
                  </li>
                </ul>

                <h3 className="font-display text-lg text-ink-800 mb-2 mt-6">
                  Information Collected Automatically
                </h3>
                <ul className="list-disc pl-6 space-y-2 font-body text-ink-600">
                  <li>
                    <strong>Usage data:</strong> pages visited, features used,
                    and actions taken within the Service.
                  </li>
                  <li>
                    <strong>Device information:</strong> browser type, operating
                    system, and device identifiers.
                  </li>
                  <li>
                    <strong>Log data:</strong> IP address, access times, and
                    referring URLs.
                  </li>
                  <li>
                    <strong>Cookies:</strong> we use essential cookies to
                    maintain your session and preferences. We do not use
                    third-party advertising cookies.
                  </li>
                </ul>
              </div>

              {/* 2 */}
              <div>
                <h2 className="font-display text-2xl text-ink-900 mb-4">
                  2. How We Use Your Information
                </h2>
                <p className="font-body text-ink-600 leading-relaxed mb-4">
                  We use the information we collect to:
                </p>
                <ul className="list-disc pl-6 space-y-2 font-body text-ink-600">
                  <li>Provide, maintain, and improve the Service.</li>
                  <li>
                    Process transactions and send related notifications (e.g.,
                    offers, payment confirmations).
                  </li>
                  <li>
                    Send administrative messages, including security alerts and
                    account updates.
                  </li>
                  <li>
                    Respond to your comments, questions, and support requests.
                  </li>
                  <li>
                    Monitor and analyze usage trends to improve user experience.
                  </li>
                  <li>
                    Detect, prevent, and address fraud or technical issues.
                  </li>
                </ul>
              </div>

              {/* 3 */}
              <div>
                <h2 className="font-display text-2xl text-ink-900 mb-4">
                  3. How We Share Your Information
                </h2>
                <p className="font-body text-ink-600 leading-relaxed mb-4">
                  We do not sell your personal information. We may share your
                  information only in the following circumstances:
                </p>
                <ul className="list-disc pl-6 space-y-2 font-body text-ink-600">
                  <li>
                    <strong>Service providers:</strong> with third-party vendors
                    who perform services on our behalf (e.g., hosting, email
                    delivery, payment processing), subject to confidentiality
                    obligations.
                  </li>
                  <li>
                    <strong>Within your organization:</strong> information you
                    enter about performers is visible to other authorized members
                    of your organization on Podium.
                  </li>
                  <li>
                    <strong>With the performer:</strong> when you send an offer,
                    gig details, music, or a W-9 request, the relevant
                    information (dates, venue, compensation, parts) is shared
                    with that performer through a private link sent to their
                    email address. Performers do not create an account to use
                    these links.
                  </li>
                  <li>
                    <strong>Legal requirements:</strong> if required by law,
                    regulation, or legal process.
                  </li>
                  <li>
                    <strong>Business transfers:</strong> in connection with a
                    merger, acquisition, or sale of assets, with notice to you.
                  </li>
                </ul>
              </div>

              {/* 4 */}
              <div>
                <h2 className="font-display text-2xl text-ink-900 mb-4">
                  4. Data Security
                </h2>
                <p className="font-body text-ink-600 leading-relaxed">
                  We implement industry-standard security measures to protect
                  your information, including encryption in transit (TLS) and at
                  rest, secure authentication, and access controls. Our
                  infrastructure is hosted on SOC 2-compliant providers. However,
                  no method of transmission over the internet is 100% secure, and
                  we cannot guarantee absolute security.
                </p>
              </div>

              {/* 5 */}
              <div>
                <h2 className="font-display text-2xl text-ink-900 mb-4">
                  5. Data Retention
                </h2>
                <p className="font-body text-ink-600 leading-relaxed">
                  We retain your information for as long as your account is
                  active or as needed to provide the Service. If you delete your
                  account, we will delete or anonymize your personal information
                  within 30 days, except where we are required to retain it for
                  legal or legitimate business purposes.
                </p>
              </div>

              {/* 6 */}
              <div>
                <h2 className="font-display text-2xl text-ink-900 mb-4">
                  6. Your Rights
                </h2>
                <p className="font-body text-ink-600 leading-relaxed mb-4">
                  Depending on your location, you may have the right to:
                </p>
                <ul className="list-disc pl-6 space-y-2 font-body text-ink-600">
                  <li>Access the personal information we hold about you.</li>
                  <li>Request correction of inaccurate data.</li>
                  <li>Request deletion of your data.</li>
                  <li>Object to or restrict processing of your data.</li>
                  <li>Request a portable copy of your data.</li>
                  <li>Withdraw consent where processing is based on consent.</li>
                </ul>
                <p className="font-body text-ink-600 leading-relaxed mt-4">
                  To exercise any of these rights, please contact us at{" "}
                  <a
                    href="mailto:hello@podiumpersonnel.com"
                    className="text-brass-600 hover:text-brass-700 underline underline-offset-2"
                  >
                    hello@podiumpersonnel.com
                  </a>
                  .
                </p>
              </div>

              {/* 7 */}
              <div>
                <h2 className="font-display text-2xl text-ink-900 mb-4">
                  7. Cookies
                </h2>
                <p className="font-body text-ink-600 leading-relaxed">
                  We use essential cookies to keep you signed in and remember
                  your preferences. We do not use cookies for advertising or
                  cross-site tracking. You can configure your browser to refuse
                  cookies, but some features of the Service may not function
                  properly without them.
                </p>
              </div>

              {/* 8 */}
              <div>
                <h2 className="font-display text-2xl text-ink-900 mb-4">
                  8. Third-Party Services
                </h2>
                <p className="font-body text-ink-600 leading-relaxed">
                  The Service integrates with third-party services including
                  Supabase (database and authentication), Resend (email
                  delivery), and Vercel (hosting). Each of these providers has
                  their own privacy policies governing their handling of data.
                  We encourage you to review their policies.
                </p>
              </div>

              {/* 9 */}
              <div>
                <h2 className="font-display text-2xl text-ink-900 mb-4">
                  9. Children&apos;s Privacy
                </h2>
                <p className="font-body text-ink-600 leading-relaxed">
                  The Service is not directed to individuals under 16. We do not
                  knowingly collect personal information from children. If we
                  become aware that we have collected data from a child without
                  parental consent, we will delete it promptly.
                </p>
              </div>

              {/* 10 */}
              <div>
                <h2 className="font-display text-2xl text-ink-900 mb-4">
                  10. Changes to This Policy
                </h2>
                <p className="font-body text-ink-600 leading-relaxed">
                  We may update this Privacy Policy from time to time. We will
                  notify you of material changes by posting the updated policy on
                  this page and updating the &ldquo;Last updated&rdquo; date. Your
                  continued use of the Service after changes constitutes
                  acceptance of the updated policy.
                </p>
              </div>

              {/* 11 */}
              <div>
                <h2 className="font-display text-2xl text-ink-900 mb-4">
                  11. Contact Us
                </h2>
                <p className="font-body text-ink-600 leading-relaxed">
                  If you have questions about this Privacy Policy or our data
                  practices, please contact us at:
                </p>
                <p className="font-body text-ink-600 leading-relaxed mt-4">
                  <strong>Podium Personnel</strong>
                  <br />
                  Email:{" "}
                  <a
                    href="mailto:hello@podiumpersonnel.com"
                    className="text-brass-600 hover:text-brass-700 underline underline-offset-2"
                  >
                    hello@podiumpersonnel.com
                  </a>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
