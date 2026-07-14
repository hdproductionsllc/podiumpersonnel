import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VERTICAL_SLUGS, getVertical } from "@/lib/verticals";
import { VerticalLanding } from "@/components/VerticalLanding";

export function generateStaticParams() {
  return VERTICAL_SLUGS.map((vertical) => ({ vertical }));
}

export function generateMetadata({ params }: { params: { vertical: string } }): Metadata {
  const v = getVertical(params.vertical);
  if (!v) return {};
  return {
    title: v.metaTitle,
    description: v.metaDescription,
    keywords: v.keywords,
    alternates: { canonical: `/for/${v.slug}` },
    openGraph: {
      title: `${v.metaTitle} | Podium Personnel`,
      description: v.metaDescription,
      url: `https://www.podiumpersonnel.com/for/${v.slug}`,
      siteName: "Podium Personnel",
      type: "website",
    },
  };
}

export default function VerticalPage({ params }: { params: { vertical: string } }) {
  const v = getVertical(params.vertical);
  if (!v) notFound();

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: v.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <VerticalLanding v={v} />
    </>
  );
}

// Ensure only the six known verticals are statically built; unknown slugs 404.
export const dynamicParams = false;
