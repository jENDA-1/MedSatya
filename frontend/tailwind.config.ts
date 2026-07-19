import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

// MedSatya brand tokens.
// navy #071B4F · Satya Green #00634B · Verification Gold #C99A2E · Warm White #F5F3ED
//
// Brand colours below are fixed hex (their opacity modifiers keep working).
// Theme-aware surfaces + evidence colours resolve to CSS vars defined in
// src/index.css, so high-contrast + colourblind modes can override them live.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#071B4F",
          50: "#EAEDF5",
          700: "#0C2A6B",
          900: "#050F2C",
        },
        satya: {
          DEFAULT: "#00634B",
          50: "#E6F2EE",
          600: "#00785A",
        },
        gold: {
          DEFAULT: "#C99A2E",
          50: "#F7EFD8",
        },
        warm: "#F5F3ED",
        // Theme-aware semantic surfaces (drive high-contrast mode)
        canvas: "rgb(var(--bg) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          raised: "rgb(var(--surface-2) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
        },
        line: "rgb(var(--line) / <alpha-value>)",
        focus: "rgb(var(--ring) / <alpha-value>)",
        // Evidence status palette (theme + colourblind aware)
        evidence: {
          strong: "rgb(var(--ev-strong) / <alpha-value>)",
          partial: "rgb(var(--ev-partial) / <alpha-value>)",
          claim: "rgb(var(--ev-claim) / <alpha-value>)",
          contradictory: "rgb(var(--ev-contra) / <alpha-value>)",
          unknown: "rgb(var(--ev-unknown) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: {
        xl: "calc(var(--radius))",
        "2xl": "calc(var(--radius) + 0.25rem)",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(7 27 79 / 0.04), 0 8px 24px -12px rgb(7 27 79 / 0.18)",
        lift: "0 2px 4px rgb(7 27 79 / 0.06), 0 18px 40px -16px rgb(7 27 79 / 0.28)",
      },
      keyframes: {
        "shimmer-slide": {
          to: { transform: "translate(calc(100cqw - 100%), 0)" },
        },
        "spin-around": {
          "0%": { transform: "translateZ(0) rotate(0)" },
          "15%, 35%": { transform: "translateZ(0) rotate(90deg)" },
          "65%, 85%": { transform: "translateZ(0) rotate(270deg)" },
          "100%": { transform: "translateZ(0) rotate(360deg)" },
        },
        shine: {
          "0%": { backgroundPosition: "0% 0%" },
          "50%": { backgroundPosition: "100% 100%" },
          to: { backgroundPosition: "0% 0%" },
        },
        "gradient-x": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "70%, 100%": { transform: "scale(1.35)", opacity: "0" },
        },
      },
      animation: {
        "shimmer-slide": "shimmer-slide var(--speed, 3s) ease-in-out infinite alternate",
        "spin-around": "spin-around calc(var(--speed, 3s) * 2) infinite linear",
        shine: "shine var(--duration, 8s) ease-in-out infinite",
        "gradient-x": "gradient-x 6s ease infinite",
        "fade-up": "fade-up 0.4s ease both",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
