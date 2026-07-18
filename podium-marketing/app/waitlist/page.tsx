import type { Metadata } from "next";

// David: create the Tally form at tally.so, then paste its form ID here
// before announcing this page. Until then the embed shows an empty form.
const TALLY_FORM_ID = "REPLACE_WITH_TALLY_FORM_ID";

export const metadata: Metadata = {
  title: "Founding-member waitlist",
  description:
    "Join the Podium Personnel founding-member waitlist for early access and founding-member pricing on our performing-arts staffing platform.",
  alternates: {
    canonical: "/waitlist",
  },
  openGraph: {
    title: "Founding-member waitlist | Podium Personnel",
    description:
      "Get founding-member pricing and early access to Podium Personnel.",
    url: "https://www.podiumpersonnel.com/waitlist",
  },
};

export default function WaitlistPage() {
  return (
    <>
      {/* Header */}
      <section className="pt-32 pb-16 md:pt-40 md:pb-20 bg-cream-100">
        <div className="container-marketing">
          <div className="max-w-2xl mx-auto text-center">
            <span className="eyebrow justify-center">Early access</span>
            <h1 className="mt-5 font-display text-display-lg text-ink-900 tracking-tight text-balance">
              Get founding-member pricing
            </h1>
            <p className="mx-auto mt-6 max-w-xl font-body text-lg text-ink-500 leading-relaxed text-balance">
              We&apos;re bringing on a first group of ensembles, orchestras, and
              agencies at founding-member rates. Leave your details below and
              we&apos;ll reach out with early access and a price that stays locked
              in as we grow.
            </p>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="section-padding bg-white">
        <div className="container-marketing">
          <div className="max-w-2xl mx-auto">
            <iframe
              src={`https://tally.so/embed/${TALLY_FORM_ID}?alignLeft=1&hideTitle=1&transparentBackground=1`}
              width="100%"
              height="500"
              frameBorder={0}
              marginHeight={0}
              marginWidth={0}
              title="Founding-member waitlist"
            />
          </div>
        </div>
      </section>
    </>
  );
}
