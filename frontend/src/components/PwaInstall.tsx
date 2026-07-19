import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, Download, Menu, Plus, Share, Smartphone } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/a11y";
import { Button } from "@/components/ui/button";

export interface PwaInstallProps {
  className?: string;
}

/** Minimal shape of the `beforeinstallprompt` event we actually use. */
interface InstallPromptEvent {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mediaStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return mediaStandalone || iosStandalone;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Small labelled pill identifying a platform/browser combo (e.g. "Android · Chrome"). */
function PlatformPill({ label }: { label: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-ink/5 px-2.5 text-xs font-medium text-ink-muted">
      <Smartphone size={14} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * "Add MedSatya to your home screen" — an honest PWA-install prompt.
 * This is a Progressive Web App, not an app-store listing: no fake store
 * badges, just the real install affordances each platform actually offers.
 */
export default function PwaInstall({ className }: PwaInstallProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [installed, setInstalled] = useState(isStandalone);
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as unknown as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <div
        role="status"
        className={cn(
          "flex items-center gap-2.5 rounded-2xl border border-line bg-surface-raised px-4 py-3 text-sm text-ink-muted",
          className,
        )}
      >
        <CheckCircle2 size={18} className="shrink-0 text-satya" aria-hidden="true" />
        <span>Installed — MedSatya is on your home screen.</span>
      </div>
    );
  }

  const ios = isIos();
  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
      }
    } finally {
      setDeferredPrompt(null);
      setInstalling(false);
    }
  };

  const cardClassName = cn(
    "rounded-2xl border border-line bg-surface p-5 shadow-soft",
    className,
  );

  const content = (
    <>
      <div className="flex items-center gap-2.5">
        <Download size={20} className="shrink-0 text-navy" aria-hidden="true" />
        <h3 className="text-base font-bold text-ink">Install MedSatya</h3>
      </div>
      <p className="mt-1.5 text-sm text-ink-muted">
        Works offline. No app store needed — it installs straight from your browser.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {deferredPrompt && (
          <>
            <Button
              variant="primary"
              size="md"
              onClick={handleInstall}
              disabled={installing}
              aria-label="Install MedSatya app"
              className="self-start"
            >
              <Download size={18} aria-hidden="true" />
              {installing ? "Installing…" : "Install app"}
            </Button>
            <PlatformPill label="Android · Chrome" />
          </>
        )}

        {!deferredPrompt && ios && (
          <>
            <ol className="flex flex-col gap-2 text-sm text-ink">
              <li className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/5 text-xs font-bold text-ink-muted">
                  1
                </span>
                <Share size={16} className="shrink-0 text-navy" aria-hidden="true" />
                <span>
                  Tap the <strong>Share</strong> button
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/5 text-xs font-bold text-ink-muted">
                  2
                </span>
                <Plus size={16} className="shrink-0 text-navy" aria-hidden="true" />
                <span>
                  Choose <strong>Add to Home Screen</strong>
                </span>
              </li>
            </ol>
            <PlatformPill label="iPhone · Safari" />
          </>
        )}

        {!deferredPrompt && !ios && (
          <>
            <div className="flex items-center gap-2.5 text-sm text-ink">
              <Menu size={16} className="shrink-0 text-navy" aria-hidden="true" />
              <span>
                Open your browser menu and choose <strong>&ldquo;Install app&rdquo;</strong> /{" "}
                <strong>&ldquo;Add to Home Screen&rdquo;</strong>.
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <PlatformPill label="Android · Chrome" />
              <PlatformPill label="iPhone · Safari" />
            </div>
          </>
        )}
      </div>
    </>
  );

  if (reduceMotion) {
    return <div className={cardClassName}>{content}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={cardClassName}
    >
      {content}
    </motion.div>
  );
}
