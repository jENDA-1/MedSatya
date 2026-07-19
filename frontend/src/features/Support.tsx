import type { ReactNode } from "react";
import { motion } from "motion/react";
import {
  MapPin,
  HeartPulse,
  ShieldCheck,
  Phone,
  Compass,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/lib/a11y";
import { cn } from "@/lib/cn";
import PwaInstall from "@/components/PwaInstall";

interface HowItWorksStep {
  icon: LucideIcon;
  title: string;
  description: string;
}

const HOW_IT_WORKS: HowItWorksStep[] = [
  {
    icon: MapPin,
    title: "Tell us where you are",
    description: "Pick your location or a city.",
  },
  {
    icon: HeartPulse,
    title: "Choose the care you need",
    description:
      "7 care types, or describe symptoms in plain words — we suggest a type, you confirm. We never diagnose.",
  },
  {
    icon: ShieldCheck,
    title: "See the evidence, not a rating",
    description:
      'Each facility shows how strongly the data supports it offering that care, with the exact source quotes ("receipts").',
  },
  {
    icon: Phone,
    title: "Call before you travel",
    description:
      "We never claim beds or availability — use the call checklist before you go.",
  },
];

interface EvidenceLegendEntry {
  icon: string;
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  description: string;
}

const EVIDENCE_LEGEND: EvidenceLegendEntry[] = [
  {
    icon: "✓",
    label: "Strongly supported",
    colorClass: "text-evidence-strong",
    bgClass: "bg-evidence-strong/10",
    borderClass: "border-evidence-strong/40",
    description: "Independent fields in the data back up the claim.",
  },
  {
    icon: "◐",
    label: "Partially supported",
    colorClass: "text-evidence-partial",
    bgClass: "bg-evidence-partial/10",
    borderClass: "border-evidence-partial/40",
    description: "Some corroboration exists, but not full independent confirmation.",
  },
  {
    icon: "?",
    label: "Claim only",
    colorClass: "text-evidence-claim",
    bgClass: "bg-evidence-claim/10",
    borderClass: "border-evidence-claim/40",
    description: "The facility claims this care type, but nothing else in the data supports it.",
  },
  {
    icon: "!",
    label: "Contradictory",
    colorClass: "text-evidence-contradictory",
    bgClass: "bg-evidence-contradictory/10",
    borderClass: "border-evidence-contradictory/40",
    description: "Sources in the data conflict with each other.",
  },
  {
    icon: "…",
    label: "Not enough data",
    colorClass: "text-evidence-unknown",
    bgClass: "bg-evidence-unknown/10",
    borderClass: "border-evidence-unknown/40",
    description:
      'A data gap — not evidence of absence. Grey ("we don\'t know") is different from red ("likely absent").',
  },
];

interface FaqItem {
  question: string;
  answer: ReactNode;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Does MedSatya diagnose me?",
    answer:
      "No. It never diagnoses. It maps your words to a care type, which you confirm, then shows the evidence for facilities offering that care.",
  },
  {
    question: "Does it know if a hospital has a free bed right now?",
    answer:
      "No. We never claim live beds, operation, admission, or quality. Always call ahead before you travel.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "The Virtue Foundation facilities dataset (GenAI-extracted claims). We show the source quotes so you can judge the evidence yourself.",
  },
  {
    question: 'What does "claim only" mean?',
    answer:
      "The facility claims the care type, but nothing else in the data supports it — it's an unverified claim, not a red flag.",
  },
  {
    question: "Is my saved list private?",
    answer: "It's stored locally to run the app. Please keep it non-sensitive.",
  },
  {
    question: "How do I fix wrong info?",
    answer: (
      <>
        Use the{" "}
        <Link
          to="/feedback"
          className="rounded font-semibold text-satya underline underline-offset-2 hover:text-satya-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Feedback
        </Link>{" "}
        tab. Feedback is collected to improve future evidence — it does not change results live.
      </>
    ),
  },
];

function startGuidedTour(): void {
  window.dispatchEvent(new CustomEvent("medsatya:start-tour"));
}

export default function Support() {
  const reduce = usePrefersReducedMotion();

  const fadeUp = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 10 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-40px" },
          transition: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      {/* Header */}
      <motion.header {...fadeUp(0)} className="space-y-1.5">
        <div className="flex items-center gap-2">
          <LifeBuoy className="text-satya" size={24} aria-hidden="true" />
          <h1 className="text-2xl font-extrabold text-navy">Support &amp; help</h1>
        </div>
        <p className="text-sm text-ink-muted">
          How MedSatya works, what the evidence badges mean, and where to get help.
        </p>
      </motion.header>

      {/* How MedSatya works */}
      <motion.section {...fadeUp(0.05)} aria-labelledby="how-it-works-heading" className="space-y-4">
        <h2 id="how-it-works-heading" className="text-lg font-bold text-navy">
          How MedSatya works
        </h2>
        <ol className="space-y-3">
          {HOW_IT_WORKS.map((step, i) => (
            <li
              key={step.title}
              className="flex gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy/10 text-sm font-bold text-navy"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <step.icon className="shrink-0 text-satya" size={18} aria-hidden="true" />
                  <p className="font-semibold text-ink">{step.title}</p>
                </div>
                <p className="text-sm text-ink-muted">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </motion.section>

      {/* Evidence badges legend */}
      <motion.section
        {...fadeUp(0.1)}
        aria-labelledby="evidence-legend-heading"
        className="space-y-4"
      >
        <h2 id="evidence-legend-heading" className="text-lg font-bold text-navy">
          What the evidence badges mean
        </h2>
        <ul className="space-y-2">
          {EVIDENCE_LEGEND.map((entry) => (
            <li
              key={entry.label}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3 py-2.5",
                entry.bgClass,
                entry.borderClass,
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-surface text-base font-bold",
                  entry.colorClass,
                  entry.borderClass,
                )}
                aria-hidden="true"
              >
                {entry.icon}
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className={cn("font-semibold", entry.colorClass)}>{entry.label}</p>
                <p className="text-sm text-ink-muted">{entry.description}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="rounded-xl border border-line bg-surface-raised px-3 py-2.5 text-sm italic text-ink-muted">
          These show the strength of{" "}
          <strong className="not-italic font-semibold text-ink">evidence</strong> for a care
          type — not a rating of hospital quality.
        </p>
      </motion.section>

      {/* FAQ */}
      <motion.section {...fadeUp(0.15)} aria-labelledby="faq-heading" className="space-y-3">
        <h2 id="faq-heading" className="text-lg font-bold text-navy">
          Frequently asked questions
        </h2>
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-soft">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.question}
              className="group px-4 py-3 open:bg-surface-raised first:rounded-t-2xl last:rounded-b-2xl"
            >
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded-lg font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <span
                  className="shrink-0 text-lg leading-none text-ink-muted transition-transform duration-200 group-open:rotate-45"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <div className="pb-1 pt-2 text-sm leading-relaxed text-ink-muted">{item.answer}</div>
            </details>
          ))}
        </div>
      </motion.section>

      {/* Guided tour + contact */}
      <motion.section {...fadeUp(0.2)} aria-labelledby="tour-heading" className="space-y-3">
        <div className="rounded-2xl border border-line bg-surface-raised p-6 text-center shadow-soft">
          <Compass className="mx-auto mb-2 text-satya" size={26} aria-hidden="true" />
          <h2 id="tour-heading" className="text-base font-bold text-navy">
            New here?
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
            Take a guided tour of the app to see how location, care type, and evidence fit
            together.
          </p>
          <Button variant="primary" size="md" className="mt-4" onClick={startGuidedTour}>
            Start the guided tour
          </Button>
        </div>
        <p className="px-1 text-center text-sm text-ink-muted">
          Spotted something wrong about a facility?{" "}
          <Link
            to="/feedback"
            className="rounded font-semibold text-satya underline underline-offset-2 hover:text-satya-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Send feedback
          </Link>
          .
        </p>
      </motion.section>

      {/* Install as an app (PWA) */}
      <motion.section {...fadeUp(0.25)} aria-label="Install MedSatya">
        <PwaInstall />
      </motion.section>
    </div>
  );
}
