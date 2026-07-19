import { useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { HelpCircle } from "lucide-react";
import FindCare from "@/features/FindCare";
import FacilityPassport from "@/features/FacilityPassport";
import Saved from "@/features/Saved";
import Feedback from "@/features/Feedback";
import Support from "@/features/Support";
import OfflineBanner from "@/components/OfflineBanner";
import TabBar from "@/components/TabBar";
import A11yToolbar from "@/components/A11yToolbar";
import { A11yProvider } from "@/lib/a11y";
import { hasSeenTour, startTour } from "@/lib/tour";
import { API_BASE } from "@/lib/api";

type Health = { status: string; app: string; version: string; frontend_built: boolean };

function Header() {
  return (
    <header
      className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur
                 pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-2.5">
        <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label="MedSatya home">
          <img
            src={`${import.meta.env.BASE_URL}icons/medsatya-icon.svg`}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-xl ring-1 ring-line"
          />
          <span className="flex min-w-0 flex-col leading-none">
            <span className="truncate text-[clamp(0.9rem,4vw,1.0625rem)] font-extrabold tracking-tight text-navy">
              MedSatya
            </span>
            <span className="mt-0.5 truncate text-[clamp(0.55rem,2vw,0.625rem)] font-semibold uppercase tracking-wide text-satya">
              Trust. Verify. Heal India.
            </span>
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <A11yToolbar />
          <button
            type="button"
            aria-label="How it works — start guided tour"
            onClick={() => window.dispatchEvent(new CustomEvent("medsatya:start-tour"))}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-ink hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <HelpCircle size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(API_BASE + "/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <footer className="mx-auto max-w-2xl px-4 py-6 text-center text-xs text-ink-muted">
      {health && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-satya" aria-hidden="true" />
          API {health.status} · v{health.version}
        </span>
      )}
      {err && <span className="text-evidence-contradictory">API unreachable</span>}
      {!health && !err && <span>Checking API…</span>}
      <p className="mt-1">MedSatya does not diagnose. It scores the evidence for care availability.</p>
    </footer>
  );
}

export default function App() {
  useEffect(() => {
    const onTour = () => void startTour();
    window.addEventListener("medsatya:start-tour", onTour);
    // Auto-run once on the very first visit (after the UI has painted).
    let t: number | undefined;
    if (!hasSeenTour()) t = window.setTimeout(() => void startTour(), 1000);
    return () => {
      window.removeEventListener("medsatya:start-tour", onTour);
      if (t) window.clearTimeout(t);
    };
  }, []);

  return (
    <A11yProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/+$/, "") || "/"}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-navy focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <div className="flex min-h-full flex-col bg-canvas text-ink">
          <OfflineBanner />
          <Header />
          <main id="main" className="flex-1 pb-24">
            <Routes>
              <Route path="/" element={<FindCare />} />
              <Route path="/facility/:id" element={<FacilityPassport />} />
              <Route path="/saved" element={<Saved />} />
              <Route path="/feedback" element={<Feedback />} />
              <Route path="/support" element={<Support />} />
            </Routes>
            <Footer />
          </main>
          <TabBar />
        </div>
      </BrowserRouter>
    </A11yProvider>
  );
}
