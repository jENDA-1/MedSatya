import { useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { Accessibility, Contrast, Eye, Type, Zap, RotateCcw, X } from "lucide-react";
import { useA11y, type FontScale } from "@/lib/a11y";
import { cn } from "@/lib/cn";

const FONT_LABELS: Record<FontScale, string> = { a: "A", lg: "A+", xl: "A++" };

/** Header control: opens an accessibility sheet (contrast, font size, colourblind, motion). */
export default function A11yToolbar() {
  const a11y = useA11y();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Accessibility settings"
        data-tour="a11y"
        className={cn(
          "relative grid h-10 w-10 place-items-center rounded-xl border border-line text-ink",
          "hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
          a11y.active && "border-satya/50 text-satya",
        )}
      >
        <Accessibility size={20} aria-hidden="true" />
        {a11y.active && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-satya" aria-hidden="true" />
        )}
      </button>

      {/* Default modal + dismissible bottom sheet (Escape / overlay tap / swipe-down all close it). */}
      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[1px]" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 rounded-t-2xl border border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lift outline-none">
            <div className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-ink/20" aria-hidden="true" />

            <div className="flex shrink-0 items-center justify-between gap-2 pr-9">
              <Drawer.Title className="text-base font-bold text-navy">
                Accessibility settings
              </Drawer.Title>
            </div>
            <Drawer.Description className="sr-only">
              Adjust text size, contrast, colour palette, and motion for this app. Changes apply
              immediately and are saved on this device.
            </Drawer.Description>
            <Drawer.Close
              aria-label="Close accessibility settings"
              className="absolute right-3 top-3 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X size={18} aria-hidden="true" />
            </Drawer.Close>

            <div className="space-y-5 overflow-y-auto">
              <section aria-labelledby="a11y-font-label">
                <p
                  id="a11y-font-label"
                  className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"
                >
                  <Type size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
                  Text size
                </p>
                <Segmented
                  value={a11y.font}
                  options={(Object.keys(FONT_LABELS) as FontScale[]).map((f) => ({
                    value: f,
                    label: FONT_LABELS[f],
                  }))}
                  onChange={a11y.setFont}
                />
              </section>

              <section className="space-y-1">
                <SwitchRow
                  id="a11y-hc"
                  icon={<Contrast size={18} aria-hidden="true" />}
                  label="High contrast"
                  description="Black on white, AAA contrast"
                  checked={a11y.highContrast}
                  onChange={a11y.setHighContrast}
                />
                <SwitchRow
                  id="a11y-cvd"
                  icon={<Eye size={18} aria-hidden="true" />}
                  label="Colourblind-safe"
                  description="Okabe–Ito palette for evidence colours"
                  checked={a11y.colorblind}
                  onChange={a11y.setColorblind}
                />
                <SwitchRow
                  id="a11y-motion"
                  icon={<Zap size={18} aria-hidden="true" />}
                  label="Reduce motion"
                  description="Turn off non-essential animation"
                  checked={a11y.reduceMotion}
                  onChange={a11y.setReduceMotion}
                />
              </section>

              <button
                type="button"
                onClick={a11y.reset}
                className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold text-ink-muted hover:bg-surface-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <RotateCcw size={14} aria-hidden="true" /> Reset to defaults
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

/** Native-feeling evenly-sized segmented control (e.g. text size A / A+ / A++). */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Text size"
      className="grid gap-1.5 rounded-2xl border border-line bg-surface-raised p-1.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "min-h-[44px] rounded-xl text-base font-bold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              active ? "bg-satya text-white shadow-soft" : "bg-transparent text-ink hover:bg-surface",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** A full-row switch: icon + label + description on the left, a large visual
 *  toggle on the right. The whole row is the ≥44px tap target and carries
 *  role="switch" so it's a single, clearly-labelled control for AT users. */
function SwitchRow({
  id,
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  icon: ReactNode;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const descId = description ? `${id}-desc` : undefined;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={descId}
      onClick={() => onChange(!checked)}
      className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-raised text-ink-muted"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-ink">{label}</span>
          {description && (
            <span id={descId} className="truncate text-xs text-ink-muted">
              {description}
            </span>
          )}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative h-7 w-[3.25rem] shrink-0 rounded-full transition-colors",
          checked ? "bg-satya" : "bg-ink/20",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[26px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
