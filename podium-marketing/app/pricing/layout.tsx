import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Transparent pricing for Podium — the personnel platform for orchestras, choirs, theatre, dance, church, and agencies. Start on the Free plan, or choose Ensemble ($29/mo), Orchestra ($79/mo), or Symphony ($199/mo). Every paid plan includes a 14-day free trial, no credit card required. Performers are always free.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Pricing | Podium Personnel",
    description:
      "Personnel management for every performing-arts organization. Start free, or pick Ensemble ($29/mo), Orchestra ($79/mo), or Symphony ($199/mo). 14-day free trial on any paid plan, no credit card required. Performers always free.",
    url: "https://www.podiumpersonnel.com/pricing",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What happens after my trial?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Your 14-day trial runs on a paid plan with no credit card required. When it ends, your account moves to the Free plan and every bit of your data stays put — your roster, projects, offers, and payment history are all retained. You simply can't exceed the Free limits or use paid features until you choose a plan. Upgrade whenever you're ready and everything unlocks again.",
      },
    },
    {
      "@type": "Question",
      name: "Are performers really always free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Always. The performer portal never costs your people a cent — one login to see the work from every group they play, sing, or dance for. Only the organization doing the staffing pays for Podium. Performers already have enough expenses.",
      },
    },
    {
      "@type": "Question",
      name: "Which plan is right for me?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "It comes down to roster size and how you work. Ensemble fits a chamber group, a single choir, a church music team, or a small agency running one lineup. Orchestra suits a growing organization that runs substitution cascades, exports to QuickBooks, and shares admin duties across a few people. Symphony is for institutions managing multiple ensembles with unlimited performers and seats. Free is a genuine home for getting organized, not just a teaser.",
      },
    },
    {
      "@type": "Question",
      name: "What if I go over my performer limit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Nothing you've built disappears. If you reach your plan's performer limit, your existing roster and data stay exactly as they are — you just can't add new performers until you upgrade or trim the list. We never delete your data to push you into a plan.",
      },
    },
    {
      "@type": "Question",
      name: "Do you offer a nonprofit discount?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Registered 501(c)(3) organizations receive 25% off any paid plan. Reach out with your tax-exempt documentation and we'll apply the discount to your account.",
      },
    },
    {
      "@type": "Question",
      name: "Can I change plans anytime?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Anytime, up or down. Move to a larger plan the moment your season grows, or step back down when it quiets — changes are prorated so you only pay for what you use. No contracts, no commitments, cancel with one click.",
      },
    },
  ],
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </>
  );
}
