/**
 * Guided onboarding tour (driver.js). The driver.js engine is loaded on demand so it
 * never weighs down the initial bundle; only its small stylesheet is bundled up front.
 * Runs once on first visit and again from the header "?" button.
 */
import "driver.js/dist/driver.css";

const SEEN_KEY = "medsatya.tour.seen.v1";

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore private-mode */
  }
}

interface Step {
  element?: string;
  popover: { title: string; description: string };
}

export async function startTour(): Promise<void> {
  const { driver } = await import("driver.js");

  const candidate: Step[] = [
    {
      popover: {
        title: "Welcome to MedSatya",
        description:
          "Find care you can trust — every claim shows its source. Here's a 20-second tour.",
      },
    },
    {
      element: '[data-tour="hero"]',
      popover: {
        title: "Start here",
        description: "Tell us where you are and what care you need — or describe symptoms in plain words.",
      },
    },
    {
      element: '[data-tour="a11y"]',
      popover: {
        title: "Made for everyone",
        description:
          "Switch on high contrast, larger text, or a colourblind-safe palette anytime. Your choice is remembered.",
      },
    },
    {
      element: '[data-tour="tabbar"]',
      popover: {
        title: "Get around",
        description: "Find care, send feedback, get help, or open your saved facilities.",
      },
    },
    {
      popover: {
        title: "You stay in control",
        description:
          "Each facility shows a Trust meter (how strongly the evidence supports that care) and the exact source “receipts”. MedSatya never diagnoses and never invents facts.",
      },
    },
  ];

  // Keep element-anchored steps only when the element is actually on screen.
  const steps = candidate.filter((s) => !s.element || document.querySelector(s.element));

  const d = driver({
    showProgress: true,
    allowClose: true,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Got it",
    steps,
  });
  d.drive();
  markSeen();
}
