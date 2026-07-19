import { useId, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Globe,
  Quote,
  Stethoscope,
  Tag,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/a11y";
import type { Citation } from "@/lib/api";
import { sourceCountLabel } from "@/lib/format";

export interface ReceiptsProps {
  citations: Citation[];
  contradictions: Citation[];
  sourceUrls: string[];
  className?: string;
}

// --- role grouping ----------------------------------------------------

const ROLE_ORDER = ["claim", "equipment", "procedure", "specialty"] as const;

const ROLE_META: Record<string, { label: string; icon: LucideIcon }> = {
  claim: { label: "Claim", icon: Quote },
  equipment: { label: "Equipment", icon: Wrench },
  procedure: { label: "Procedure", icon: Activity },
  specialty: { label: "Specialty", icon: Stethoscope },
};

function roleMeta(role: string): { label: string; icon: LucideIcon } {
  const known = ROLE_META[role];
  if (known) return known;
  const label = role.length > 0 ? role.charAt(0).toUpperCase() + role.slice(1) : "Other";
  return { label, icon: Tag };
}

function groupByRole(citations: Citation[]): Array<[string, Citation[]]> {
  const map = new Map<string, Citation[]>();
  for (const citation of citations) {
    const bucket = map.get(citation.role);
    if (bucket) bucket.push(citation);
    else map.set(citation.role, [citation]);
  }
  const known: Array<[string, Citation[]]> = [];
  for (const role of ROLE_ORDER) {
    const bucket = map.get(role);
    if (bucket) known.push([role, bucket]);
  }
  const rest: Array<[string, Citation[]]> = [];
  for (const [role, bucket] of map) {
    if (!(ROLE_ORDER as readonly string[]).includes(role)) rest.push([role, bucket]);
  }
  return [...known, ...rest];
}

// --- text / url helpers -------------------------------------------------

interface HighlightSpan {
  before: string;
  match: string;
  after: string;
}

function findHighlight(text: string, matched: string): HighlightSpan | null {
  if (!matched) return null;
  const idx = text.toLowerCase().indexOf(matched.toLowerCase());
  if (idx === -1) return null;
  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + matched.length),
    after: text.slice(idx + matched.length),
  };
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// --- receipt card ---------------------------------------------------------

interface ReceiptCardProps {
  citation: Citation;
  tone?: "default" | "contradictory";
}

function ReceiptCard({ citation, tone = "default" }: ReceiptCardProps) {
  const span = findHighlight(citation.text, citation.matched);

  return (
    <li
      className={cn(
        "rounded-xl border p-3",
        tone === "contradictory"
          ? "border-evidence-contradictory/40 bg-evidence-contradictory/10"
          : "border-line bg-surface-raised",
      )}
    >
      <p className="text-sm leading-relaxed text-ink">
        {span ? (
          <>
            {span.before}
            <mark className="rounded bg-gold/25 px-0.5 text-ink">{span.match}</mark>
            {span.after}
          </>
        ) : (
          citation.text
        )}
      </p>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-ink-muted">
        {citation.field}
      </p>
    </li>
  );
}

// --- collapsible role group -------------------------------------------------

interface CitationGroupProps {
  role: string;
  citations: Citation[];
  defaultOpen: boolean;
}

function CitationGroup({ role, citations, defaultOpen }: CitationGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const reduceMotion = usePrefersReducedMotion();
  const { label, icon: Icon } = roleMeta(role);

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-2xl px-4 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Icon aria-hidden="true" className="h-4 w-4 text-ink-muted" />
          {label}
          <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink-muted">
            {citations.length}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("h-4 w-4 text-ink-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open &&
        (reduceMotion ? (
          <ul id={contentId} className="space-y-2 px-4 pb-4">
            {citations.map((citation, i) => (
              <ReceiptCard key={i} citation={citation} />
            ))}
          </ul>
        ) : (
          <motion.ul
            id={contentId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="space-y-2 overflow-hidden px-4 pb-4"
          >
            {citations.map((citation, i) => (
              <ReceiptCard key={i} citation={citation} />
            ))}
          </motion.ul>
        ))}
    </div>
  );
}

// --- main component ---------------------------------------------------------

const SOURCES_SHOWN = 8;

export default function Receipts({
  citations,
  contradictions,
  sourceUrls,
  className,
}: ReceiptsProps) {
  const groups = useMemo(() => groupByRole(citations), [citations]);
  const [showAllSources, setShowAllSources] = useState(false);

  const isEmpty = citations.length === 0 && contradictions.length === 0 && sourceUrls.length === 0;
  if (isEmpty) {
    return (
      <p className={cn("text-sm text-ink-muted", className)}>
        No source citations recorded for this facility.
      </p>
    );
  }

  const sourceLabel = sourceCountLabel(sourceUrls);
  const visibleSources = showAllSources ? sourceUrls : sourceUrls.slice(0, SOURCES_SHOWN);
  const hasMoreSources = sourceUrls.length > SOURCES_SHOWN;

  return (
    <div className={cn("space-y-4", className)}>
      {contradictions.length > 0 && (
        <section
          aria-label="Contradictions"
          className="rounded-2xl border border-evidence-contradictory/40 bg-evidence-contradictory/10 p-4"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-evidence-contradictory">
            <AlertTriangle aria-hidden="true" className="h-5 w-5" />
            <span>Contradictions</span>
            <span className="rounded-full bg-evidence-contradictory/20 px-2 py-0.5 text-xs font-semibold">
              {contradictions.length}
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {contradictions.map((citation, i) => (
              <ReceiptCard key={i} citation={citation} tone="contradictory" />
            ))}
          </ul>
        </section>
      )}

      {groups.length > 0 && (
        <div className="space-y-2">
          {groups.map(([role, roleCitations], idx) => (
            <CitationGroup key={role} role={role} citations={roleCitations} defaultOpen={idx === 0} />
          ))}
        </div>
      )}

      {sourceUrls.length > 0 && (
        <section aria-label="Sources" className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-ink">Sources</h4>
            <span className="text-xs font-medium text-ink-muted">{sourceLabel} receipts</span>
          </div>
          <ul className="mt-3 space-y-1">
            {visibleSources.map((url, i) => (
              <li key={i}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm text-ink-muted hover:bg-surface-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <Globe aria-hidden="true" className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{hostnameOf(url)}</span>
                </a>
              </li>
            ))}
          </ul>
          {hasMoreSources && !showAllSources && (
            <button
              type="button"
              onClick={() => setShowAllSources(true)}
              className="mt-1 min-h-[44px] rounded-lg px-2 text-sm font-semibold text-satya focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Show all {sourceUrls.length}
            </button>
          )}
          {sourceLabel === "50+" && (
            <p className="mt-2 text-xs text-ink-muted">
              Capped by the dataset at 50 — the real number is likely higher.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
