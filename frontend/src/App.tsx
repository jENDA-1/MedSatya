import { useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import FindCare from "@/features/FindCare";
import FacilityPassport from "@/features/FacilityPassport";
import Saved from "@/features/Saved";
import OfflineBanner from "@/components/OfflineBanner";

type Health = { status: string; app: string; version: string; frontend_built: boolean };

function Header() {
  return (
    <header className="border-b border-navy/10 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex flex-col leading-tight">
          <span className="text-lg font-extrabold tracking-tight text-navy">MedSatya</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-satya">
            Trust. Verify. Heal India.
          </span>
        </Link>
        <Link
          to="/saved"
          className="min-h-[40px] rounded-xl border border-navy/15 px-3 py-2 text-sm font-semibold text-navy hover:bg-navy/5"
        >
          Saved
        </Link>
      </div>
    </header>
  );
}

function Footer() {
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <footer className="mx-auto max-w-2xl px-4 py-6 text-center text-xs text-navy/40">
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
  return (
    <BrowserRouter>
      <div className="flex min-h-full flex-col bg-warm">
        <OfflineBanner />
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<FindCare />} />
            <Route path="/facility/:id" element={<FacilityPassport />} />
            <Route path="/saved" element={<Saved />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}
