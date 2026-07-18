import { useEffect, useState } from "react";

type Health = { status: string; app: string; version: string; frontend_built: boolean };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <main className="min-h-full flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="max-w-xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-navy text-warm shadow-lg">
          <span className="text-2xl font-bold text-gold">✓</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-navy">MedSatya</h1>
        <p className="mt-2 text-lg font-medium text-satya">Trust. Verify. Heal India.</p>
        <p className="mt-6 text-navy/70">
          A Referral Copilot that helps you find trustworthy care. Every claim shows its source —
          we distinguish <strong>“we don’t know”</strong> from <strong>“care is missing”</strong>,
          and we never invent facts about beds, operation, or quality.
        </p>

        <div className="mt-10 rounded-xl border border-navy/10 bg-white p-4 text-left text-sm">
          <div className="font-semibold text-navy">Deploy pipeline</div>
          {health && (
            <div className="mt-2 flex items-center gap-2 text-satya">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-satya" />
              API <code>{health.status}</code> · v{health.version} · frontend{" "}
              {health.frontend_built ? "built" : "dev"}
            </div>
          )}
          {err && <div className="mt-2 text-evidence-contradictory">API unreachable: {err}</div>}
          {!health && !err && <div className="mt-2 text-navy/50">checking…</div>}
        </div>

        <p className="mt-8 text-xs text-navy/40">
          Hack-Nation × Databricks · Challenge&nbsp;#04 “Data Legend” · MVP skeleton
        </p>
      </div>
    </main>
  );
}
