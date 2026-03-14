# Podium Personnel Marketing Website

A modern, beautiful marketing website for Podium Personnel built with Next.js 14, Tailwind CSS, and Framer Motion.

## Design

- **Aesthetic**: Refined editorial - the elegance of classical music meets modern SaaS
- **Typography**: Fraunces (display) + DM Sans (body)
- **Color Palette**: Warm cream backgrounds, deep ink text, brass accents

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Fonts**: Google Fonts (Fraunces, DM Sans)

## Pages

- `/` - Homepage with hero, pain points, features, portal section, testimonials, pricing preview
- `/features` - Detailed feature breakdown with sticky navigation
- `/pricing` - Pricing tiers, feature comparison table, FAQs
- `/about` - Company story, mission, values, timeline

## Getting Started

### Install dependencies

```bash
npm install
```

### Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build for production

```bash
npm run build
```

### Start production server

```bash
npm start
```

## Deployment

### Deploy to Vercel (Recommended)

1. Push this code to a GitHub repository
2. Import the repository in [Vercel](https://vercel.com)
3. Vercel will auto-detect Next.js and configure everything
4. Set up your custom domain (podiumpersonnel.com)

### Environment Variables

No environment variables required for the marketing site.

If you add analytics or forms later, add them to `.env.local`:

```
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

## Customization

### Colors

Edit `tailwind.config.ts` to adjust the color palette:

- `cream` - Background colors
- `ink` - Text colors
- `brass` - Primary accent (gold/bronze)
- `burgundy` - Secondary accent (red)

### Fonts

Fonts are loaded in `app/layout.tsx`. To change them:

1. Import different fonts from `next/font/google`
2. Update the CSS variables
3. Update `tailwind.config.ts` font family references

### Content

All copy is inline in the page components. To update:

- Homepage: `app/page.tsx`
- Features: `app/features/page.tsx`
- Pricing: `app/pricing/page.tsx`
- About: `app/about/page.tsx`

## Structure

```
podium-marketing/
├── app/
│   ├── layout.tsx          # Root layout with fonts
│   ├── globals.css         # Global styles & Tailwind
│   ├── page.tsx            # Homepage
│   ├── features/page.tsx   # Features page
│   ├── pricing/page.tsx    # Pricing page
│   └── about/page.tsx      # About page
├── components/
│   └── layout/
│       ├── Navbar.tsx      # Navigation
│       └── Footer.tsx      # Footer
├── tailwind.config.ts      # Tailwind configuration
├── next.config.js          # Next.js configuration
└── package.json
```

## Next Steps

1. **Add real images**: Replace placeholder visuals with screenshots and photos
2. **Add contact page**: Create `/contact` with a form (use Formspree or similar)
3. **Add blog**: Set up MDX or connect to a CMS
4. **Add analytics**: Google Analytics, Mixpanel, or Plausible
5. **Add status page**: Link to a status.io or similar service

## License

Private - Podium Personnel
