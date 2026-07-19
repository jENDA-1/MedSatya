import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Search,
  ShieldCheck,
  AlertTriangle,
  ListChecks,
  Check,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/a11y";

export interface VerificationSequenceProps {
  /** True while the shortlist query runs. */
  active: boolean;
  className?: string;
}

interface Step {
  label: string;
  icon: LucideIcon;
}

const STEPS: readonly Step[] = [
  { label: "Searching records", icon: Search },
  { label: "Checking evidence", icon: ShieldCheck },
  { label: "Detecting contradictions", icon: AlertTriangle },
  { label: "Building shortlist", icon: ListChecks },
];

const LAST_STEP = STEPS.length - 1;
const STEP_INTERVAL_MS = 900;

type StepState = "done" | "current" | "pending";

function stateFor(index: number, currentStep: number): StepState {
  if (index < currentStep) return "done";
  if (index === currentStep) return "current";
  return "pending";
}

/**
 * Vertical stepper shown while the shortlist query runs (warehouse cold-start
 * can take a few seconds, so this carries real functional meaning, not just
 * decoration). Advances through 4 verification steps on a timer and caps at
 * the last one ("Building shortlist") instead of looping, so a long wait
 * still reads as "almost done" rather than stuck.
 */
export default function VerificationSequence({ active, className }: VerificationSequenceProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [currentStep, setCurrentStep] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCurrentStep(0);
    if (!active) return;

    intervalRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= LAST_STEP) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return prev;
        }
        return prev + 1;
      });
    }, STEP_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active]);

  if (!active) return null;

  const currentLabel = STEPS[currentStep]?.label ?? STEPS[0].label;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={active}
      className={cn("rounded-2xl border border-line bg-surface p-4 shadow-soft", className)}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          <span className="absolute inset-0 rounded-full bg-satya animate-pulse-ring" />
          <span className="relative h-2 w-2 rounded-full bg-satya" />
        </span>
        <p className="text-sm font-semibold text-ink">Verifying care evidence</p>
      </div>
      <p className="mt-0.5 pl-4 text-xs text-ink-muted">
        Reading the sources — we never invent facts.
      </p>
      {/* Concise live announcement; the visible list below stays fully static text. */}
      <span className="sr-only">{currentLabel}</span>

      <ol className="mt-4 flex flex-col">
        {STEPS.map((step, index) => (
          <StepRow
            key={step.label}
            step={step}
            state={stateFor(index, currentStep)}
            isLast={index === LAST_STEP}
            connectorFilled={currentStep > index}
            reduceMotion={reduceMotion}
          />
        ))}
      </ol>
    </div>
  );
}

interface StepRowProps {
  step: Step;
  state: StepState;
  isLast: boolean;
  /** Whether the connector line below this node should read as filled. */
  connectorFilled: boolean;
  reduceMotion: boolean;
}

function StepRow({ step, state, isLast, connectorFilled, reduceMotion }: StepRowProps) {
  const Icon = step.icon;

  const circleClass = cn(
    "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
    state === "pending" ? "bg-ink/10 text-ink-muted" : "bg-satya/15 text-satya",
  );

  const labelClass = cn(
    "text-sm",
    state === "done" && "font-medium text-satya",
    state === "current" && "font-semibold text-ink",
    state === "pending" && "text-ink-muted",
  );

  return (
    <li className={cn("relative flex gap-3", !isLast && "pb-6")}>
      {!isLast && (
        <div className="absolute left-4 top-8 bottom-0 w-px bg-ink/10">
          {reduceMotion ? (
            <div className={cn("h-full w-full bg-satya", connectorFilled ? "opacity-100" : "opacity-0")} />
          ) : (
            <motion.div
              className="w-full origin-top bg-gradient-to-b from-satya to-satya/40"
              initial={false}
              animate={{ height: connectorFilled ? "100%" : "0%" }}
              transition={{ duration: 0.45, ease: "easeInOut" }}
            />
          )}
        </div>
      )}

      {state === "current" && !reduceMotion ? (
        <motion.div
          className={circleClass}
          animate={{ scale: [1, 1.08, 1], opacity: [1, 0.85, 1] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
        >
          <Icon size={16} strokeWidth={2.5} aria-hidden="true" />
        </motion.div>
      ) : (
        <div className={circleClass}>
          {state === "done" ? (
            <Check size={16} strokeWidth={2.75} aria-hidden="true" />
          ) : (
            <Icon size={16} strokeWidth={2.5} aria-hidden="true" />
          )}
        </div>
      )}

      <div className="pt-1.5">
        <p className={labelClass}>{step.label}</p>
        {state === "current" && reduceMotion && (
          <p className="text-xs text-ink-muted">Working…</p>
        )}
      </div>
    </li>
  );
}
