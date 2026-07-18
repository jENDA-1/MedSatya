// Minimal i18n scaffold. English is fully populated for the MVP; Hindi and pilot-region
// languages are PREPARED here as the next step. Language is only ever SUGGESTED from region
// signals — the app never switches language without explicit user consent (privacy + concept ch.4).
export type Locale = "en" | "hi";
export const SUPPORTED: Locale[] = ["en", "hi"];

const STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    "app.tagline": "Trust. Verify. Heal India.",
    "flow.where": "Where are you?",
    "flow.whatCare": "What care do you need?",
    "flow.whereGo": "Where can you go?",
  },
  hi: {
    // Prepared for translation — falls back to English until populated.
  },
};

let current: Locale = "en";

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (SUPPORTED.includes(locale)) current = locale;
}

export function t(key: string, fallback: string): string {
  return STRINGS[current][key] ?? STRINGS.en[key] ?? fallback;
}

/** Suggest (never auto-apply) a language from browser/region signals. Returns null if the
 *  default (English) is fine, so the UI only ever *offers* a switch the user must confirm. */
export function suggestLocale(): Locale | null {
  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("hi")) return "hi";
  return null;
}
