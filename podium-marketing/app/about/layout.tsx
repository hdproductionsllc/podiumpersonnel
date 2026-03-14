import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "Podium Personnel was built by musicians, for musicians. Learn about our mission to simplify ensemble management so you can focus on what matters — the music.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About | Podium Personnel",
    description:
      "Built by musicians, for musicians. Learn about our mission to simplify ensemble management.",
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
