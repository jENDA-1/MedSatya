import { useEffect, useState } from "react";
import { getCachedShortlist } from "@/lib/store";

function relTime(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

/** Shows a persistent reminder when offline: data may be stale, always confirm by phone.
 *  Surfaces the cached shortlist timestamp so users know how old the information is. */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!offline) return null;
  const cached = getCachedShortlist();

  return (
    <div
      role="status"
      className="border-b border-gold/50 bg-gold/20 px-4 py-2 text-center text-xs font-medium text-navy"
    >
      <span aria-hidden="true">⚠ </span>
      You're offline.{" "}
      {cached
        ? `Showing your last search (cached ${relTime(cached.fetchedAt)}).`
        : "Showing saved information only."}{" "}
      Always confirm current operation, staffing and bed availability by phone.
    </div>
  );
}
