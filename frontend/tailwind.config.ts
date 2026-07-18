import type { Config } from "tailwindcss";

// MedSatya brand tokens.
// navy #071B4F · Satya Green #00634B · Verification Gold #C99A2E · Warm White #F5F3ED
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
        // Evidence status palette (accessible, not colour-only in UI)
        evidence: {
          strong: "#00634B",
          partial: "#C99A2E",
          claim: "#6B7280",
          contradictory: "#B4232A",
          unknown: "#94A3B8",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
