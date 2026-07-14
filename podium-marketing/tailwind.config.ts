import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary palette - warm, sophisticated
        cream: {
          50: "#FFFDF9",
          100: "#FAF7F2",
          200: "#F5F0E8",
          300: "#EBE4D8",
          400: "#DDD4C4",
        },
        ink: {
          50: "#F8FAFC",
          100: "#E2E8F0",
          200: "#CBD5E1",
          300: "#94A3B8",
          400: "#64748B",
          500: "#475569",
          600: "#334155",
          700: "#1E293B",
          800: "#0F172A",
          900: "#020617",
        },
        // Accent - warm brass/gold
        brass: {
          50: "#FDF8F0",
          100: "#FAF0E1",
          200: "#F5DFC0",
          300: "#E8C896",
          400: "#D4A574",
          500: "#C4915A",
          600: "#A67542",
          700: "#8B5E35",
          800: "#6B4728",
          900: "#4A311C",
        },
        // Secondary accent - deep burgundy
        burgundy: {
          50: "#FDF2F2",
          100: "#FCE4E4",
          200: "#FACACA",
          300: "#F5A3A3",
          400: "#EC6B6B",
          500: "#DC4343",
          600: "#B91C1C",
          700: "#991B1B",
          800: "#7C1D1D",
          900: "#5C1414",
        },
        // Warm near-black "curtain" tones for dramatic, opening-night dark sections
        curtain: {
          700: "#221913",
          800: "#181109",
          900: "#0E0A06",
        },
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        body: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["4.5rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "display-lg": ["3.5rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "display-md": ["2.5rem", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        "display-sm": ["1.875rem", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "fade-in-up": "fadeInUp 0.6s ease-out forwards",
        "fade-in-down": "fadeInDown 0.6s ease-out forwards",
        "slide-in-left": "slideInLeft 0.6s ease-out forwards",
        "slide-in-right": "slideInRight 0.6s ease-out forwards",
        "float": "float 6s ease-in-out infinite",
        "pulse-soft": "pulseSoft 4s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeInDown: {
          "0%": { opacity: "0", transform: "translateY(-20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "noise": "url('/noise.svg')",
        // Warm overhead "spotlight" wash for dark stage sections
        "spotlight": "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(212,165,116,0.22), transparent 70%)",
        "spotlight-accent": "radial-gradient(ellipse 70% 55% at 50% -5%, var(--accent-glow, rgba(212,165,116,0.22)), transparent 70%)",
      },
      boxShadow: {
        "glow": "0 0 60px -12px var(--accent-glow, rgba(196,145,90,0.45))",
      },
    },
  },
  plugins: [],
};
export default config;
