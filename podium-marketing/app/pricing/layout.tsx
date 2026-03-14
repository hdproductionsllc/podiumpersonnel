import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for Podium Personnel. Free plan to get started, Pro at $29/month for unlimited access. 14-day free trial, no credit card required. Musicians always free.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Pricing | Podium Personnel",
    description:
      "Free plan to get started, Pro at $29/month for unlimited access. 14-day free trial, no credit card required. Musicians always free.",
    url: "https://www.podiumpersonnel.com/pricing",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What happens after my 14-day trial?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "After your trial, your account moves to the Free plan. You keep all your data — you just can't exceed the Free limits (25 musicians, 3 active projects) or use Pro features like bulk import and saved ensembles. Upgrade anytime to unlock everything again.",
      },
    },
    {
      "@type": "Question",
      name: "Do musicians have to pay?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Never. The musician portal is always free for musicians. Only organizations pay for Podium. We believe musicians already have enough expenses.",
      },
    },
    {
      "@type": "Question",
      name: "Can I send contract offers on the Free plan?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! Contract offers are included on every plan — it's the core of what Podium does. Free plan users can send offers, track responses, and manage their projects. Pro unlocks additional communication tools like gig details, group messaging, and portal invites.",
      },
    },
    {
      "@type": "Question",
      name: "Is there a contract or commitment?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No contracts, no commitments. Pay monthly, cancel anytime with one click. We believe in earning your business every month.",
      },
    },
    {
      "@type": "Question",
      name: "Do you offer discounts for nonprofits?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! Registered 501(c)(3) organizations receive 25% off. Contact us with your tax-exempt documentation to apply the discount.",
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
