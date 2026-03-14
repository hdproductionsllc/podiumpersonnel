import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore Podium Personnel features: roster management, one-click gig offers, payment tracking, musician portal, calendar sync, and more. Everything you need to run your ensemble.",
  alternates: {
    canonical: "/features",
  },
  openGraph: {
    title: "Features | Podium Personnel",
    description:
      "Roster management, one-click gig offers, payment tracking, musician portal, and more. Everything you need to run your ensemble.",
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
