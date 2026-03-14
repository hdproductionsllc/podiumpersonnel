import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.podiumpersonnel.com"),
  title: {
    default: "Podium Personnel | The Modern Way to Manage Musicians",
    template: "%s | Podium Personnel",
  },
  description:
    "Stop chasing musicians. Start making music. Podium Personnel is the simple way to manage your roster, send gig offers, and track payments. Built for quartets, ensembles, and orchestras.",
  keywords: [
    "musician management",
    "orchestra management software",
    "personnel management",
    "string quartet management",
    "chamber ensemble software",
    "gig management",
    "contractor software",
    "music personnel",
    "orchestra staffing",
    "ensemble management",
  ],
  authors: [{ name: "Podium Personnel" }],
  creator: "Podium Personnel",
  publisher: "Podium Personnel",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Podium Personnel | The Modern Way to Manage Musicians",
    description:
      "Stop chasing musicians. Start making music. Manage your roster, send gig offers, and track payments — built for quartets, ensembles, and orchestras.",
    url: "https://www.podiumpersonnel.com",
    siteName: "Podium Personnel",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Podium Personnel | The Modern Way to Manage Musicians",
    description:
      "Stop chasing musicians. Start making music. Manage your roster, send gig offers, and track payments — built for quartets, ensembles, and orchestras.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.podiumpersonnel.com/#organization",
      name: "Podium Personnel",
      url: "https://www.podiumpersonnel.com",
      description:
        "The modern way to manage your musicians. Built for quartets, ensembles, and orchestras.",
    },
    {
      "@type": "WebSite",
      "@id": "https://www.podiumpersonnel.com/#website",
      url: "https://www.podiumpersonnel.com",
      name: "Podium Personnel",
      publisher: {
        "@id": "https://www.podiumpersonnel.com/#organization",
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "Podium Personnel",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://www.podiumpersonnel.com",
      description:
        "Manage your musician roster, send gig offers, and track payments. Built for quartets, ensembles, and orchestras.",
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "29",
        highPrice: "249",
        priceCurrency: "USD",
        offerCount: 3,
      },
      featureList: [
        "Musician roster management",
        "Gig offer sending and tracking",
        "Payment tracking",
        "Musician portal",
        "Calendar integration",
        "QuickBooks export",
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        {/* Subtle noise texture overlay */}
        <div className="noise-overlay" aria-hidden="true" />

        <Navbar />
        <main className="flex-grow">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
