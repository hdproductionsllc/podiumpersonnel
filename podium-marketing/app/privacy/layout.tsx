import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Podium Personnel privacy policy. Learn how we collect, use, and protect your personal information.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "Privacy Policy | Podium Personnel",
    description:
      "Learn how Podium Personnel collects, uses, and protects your personal information.",
    url: "https://www.podiumpersonnel.com/privacy",
  },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
