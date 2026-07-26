import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore Podium Personnel features: roster and personnel management, one-click offers, production staffing, payment tracking with W-9s and 1099s, no-account access for performers, and substitutions. Everything you need to staff the performing arts.",
  alternates: {
    canonical: "/features",
  },
  openGraph: {
    title: "Features | Podium Personnel",
    description:
      "Roster and personnel management, one-click offers, production staffing, payment tracking, no-account access for performers, and substitutions — everything you need to staff the performing arts.",
    url: "https://www.podiumpersonnel.com/features",
  },
};

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
