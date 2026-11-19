import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#080B12",
          900: "#0D111C",
          850: "#111725",
          800: "#161E30",
          700: "#1E2840"
        },
        accent: {
          300: "#A5B4FC",
          400: "#818CF8",
          500: "#6366F1",
          600: "#5457E5",
          700: "#4338CA"
        },
        violet: {
          400: "#A78BFA",
          500: "#8B5CF6",
          600: "#7C3AED"
        },
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        }
      },
      borderRadius: {
        xl: "16px",
        "2xl": "20px",
        lg: "12px",
        md: "10px",
        sm: "8px"
      },
      boxShadow: {
        soft: "0 8px 30px rgba(0,0,0,0.25)",
        card: "0 1px 2px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.22)",
        glow: "0 0 0 1px rgba(99,102,241,0.35), 0 8px 32px rgba(99,102,241,0.22)"
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(.97)" },
          to: { opacity: "1", transform: "scale(1)" }
        },
        "slide-in-right": {
          from: { transform: "translateX(16px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" }
        },
        shimmer: {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(100%)" }
        }
      },
      animation: {
        "fade-in": "fade-in .28s ease-out both",
        "scale-in": "scale-in .18s ease-out both",
        "slide-in-right": "slide-in-right .22s ease-out both",
        shimmer: "shimmer 1.4s infinite"
      }
    }
  },
  plugins: []
};
export default config;
