import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "Podium was built by people who've run the call — managing personnel across the performing arts. Learn about our mission to make staffing orchestras, choirs, theatre, dance, worship, and agencies simple and affordable.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About | Podium Personnel",
    description:
      "Built by people who've run the call. Our mission: make staffing the performing arts simple, modern, and affordable — for every organization the enterprise tools ignore.",
    url: "https://www.podiumpersonnel.com/about",
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
