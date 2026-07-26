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
    default: "Podium Personnel | Personnel Software for the Performing Arts",
    template: "%s | Podium Personnel",
  },
  description:
    "The personnel platform for performing-arts organizations. Staff every rehearsal and performance — build your roster, send offers people answer from their phone, fill gaps automatically, and track pay. For orchestras, choirs, theatre, dance, church, and agencies.",
  keywords: [
    "performing arts personnel software",
    "orchestra personnel software",
    "substitute musician management",
    "choir scheduling software",
    "theatre company staffing",
    "dance company management",
    "church musician scheduling",
    "entertainment agency booking software",
    "ensemble management software",
    "gig offer software",
  ],
  authors: [{ name: "Podium Personnel" }],
  creator: "Podium Personnel",
  publisher: "Podium Personnel",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Podium Personnel | Personnel Software for the Performing Arts",
    description:
      "Staff every rehearsal and performance. Build your roster, send offers people answer from their phone, and track pay — for orchestras, choirs, theatre, dance, church, and agencies.",
    url: "https://www.podiumpersonnel.com",
    siteName: "Podium Personnel",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Podium Personnel — personnel software for the performing arts",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Podium Personnel | Personnel Software for the Performing Arts",
    description:
      "Staff every rehearsal and performance. Build your roster, send offers people answer from their phone, and track pay — for orchestras, choirs, theatre, dance, church, and agencies.",
    images: ["/og-image.jpg"],
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
        "The personnel platform for performing-arts organizations — orchestras, choirs, theatre, dance, church, and agencies.",
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
        "Staff every rehearsal and performance: build your roster, send offers, cascade to subs, and track pay. For orchestras, choirs, theatre, dance, church, and agencies.",
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "0",
        highPrice: "199",
        priceCurrency: "USD",
        offerCount: 4,
      },
      featureList: [
        "Roster and personnel management",
        "Offer sending, tracking, and cascade",
        "Substitute and backfill workflow",
        "Payment, W-9, and 1099 tracking",
        "No-account access for performers",
        "Calendar integration and QuickBooks export",
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
