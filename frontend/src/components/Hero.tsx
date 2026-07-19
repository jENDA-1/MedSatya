import { motion } from "motion/react";
import { ShieldCheck, FileText, HeartHandshake, RotateCcw, X } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/a11y";
import { cn } from "@/lib/cn";

export interface HeroResumeChip {
  careNeedLabel: string;
  locationLabel: string;
  onResume: () => void;
  onDismiss: () => void;
}

/** Motion "rise" preset (respects reduced-motion). */
function makeRise(reduce: boolean) {
  return (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const },
        };
}

/**
 * Landing header: the headline (+ optional "Resume last search" shortcut). The location flow
 * renders directly below this, so the actionable steps lead. The logo, our promise, and the
 * three honesty chips now close the page — see {@link HeroTrustFooter}.
 */
export default function Hero({ resume }: { resume?: HeroResumeChip | null }) {
  const reduce = usePrefersReducedMotion();
  const rise = makeRise(reduce);

  return (
    <section
      className="relative overflow-hidden"
      aria-labelledby="hero-title"
      data-tour="hero"
    >
      <AuroraBackdrop reduce={reduce} />

      <div className="relative mx-auto flex max-w-2xl flex-col items-center px-4 pb-2 pt-10 text-center sm:pt-12">
        <motion.h1
          {...rise(0)}
          id="hero-title"
          className="text-balance text-3xl font-extrabold leading-tight tracking-tight text-navy sm:text-4xl"
        >
          Find{" "}
          <span className="bg-gradient-to-r from-satya to-gold bg-clip-text text-transparent">
            trusted
          </span>{" "}
          care
        </motion.h1>

        {resume && (
          <motion.div {...rise(0.12)} className="mt-4 w-full max-w-full px-2">
            <div className="mx-auto inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface/80 py-1.5 pl-1 pr-1.5 text-xs font-medium text-ink-muted shadow-soft">
              <button
                type="button"
                onClick={resume.onResume}
                className="inline-flex min-w-0 items-center gap-1.5 rounded-full py-1 pl-2 pr-1 text-left text-navy hover:text-satya focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <RotateCcw size={12} className="shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">
                  Resume last search:{" "}
                  <strong className="font-semibold">{resume.careNeedLabel}</strong> near{" "}
                  <strong className="font-semibold">{resume.locationLabel}</strong>
                </span>
              </button>
              <button
                type="button"
                onClick={resume.onDismiss}
                aria-label="Dismiss resume last search suggestion"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-ink/10 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}

/**
 * Trust footer: the logo, our one-sentence promise, and the three honesty chips. Rendered at the
 * BOTTOM of the landing (below the location flow) so the actionable steps lead and the trust story
 * closes the page.
 */
export function HeroTrustFooter() {
  const reduce = usePrefersReducedMotion();
  const rise = makeRise(reduce);

  return (
    <div className="mx-auto mt-8 flex max-w-2xl flex-col items-center px-4 pb-10 text-center">
      <motion.img
        {...rise(0)}
        src={`${import.meta.env.BASE_URL}logo.jpg`}
        alt="MedSatya"
        width={144}
        height={144}
        className="mb-5 h-36 w-36 rounded-3xl bg-white/70 object-contain p-1.5 shadow-soft ring-1 ring-line"
      />

      <motion.p
        {...rise(0.08)}
        className="max-w-md text-pretty text-base leading-relaxed text-ink-muted"
      >
        We don't rate hospitals. We show the <strong className="font-semibold text-ink">evidence</strong>{" "}
        that a facility provides the care you need — every claim with its source.
      </motion.p>

      <motion.ul
        {...rise(0.16)}
        className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-medium text-ink-muted"
      >
        <Chip icon={<FileText size={13} />}>Every claim, its source</Chip>
        <Chip icon={<ShieldCheck size={13} />}>Never invents facts</Chip>
        <Chip icon={<HeartHandshake size={13} />}>Doesn't diagnose</Chip>
      </motion.ul>
    </div>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/70 px-3 py-1">
      <span className="text-satya" aria-hidden="true">
        {icon}
      </span>
      {children}
    </li>
  );
}

/** Soft animated aurora blobs behind the hero. Fully static under reduced motion. */
function AuroraBackdrop({ reduce }: { reduce: boolean }) {
  const blob = "absolute rounded-full blur-3xl opacity-30";
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <motion.div
        className={cn(blob, "left-[10%] top-[-10%] h-56 w-56 bg-satya/40")}
        animate={reduce ? undefined : { y: [0, 18, 0], x: [0, 10, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={cn(blob, "right-[8%] top-[6%] h-52 w-52 bg-gold/40")}
        animate={reduce ? undefined : { y: [0, -16, 0], x: [0, -8, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={cn(blob, "bottom-[-20%] left-[35%] h-56 w-56 bg-navy/20")}
        animate={reduce ? undefined : { y: [0, 14, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
