import { NavLink } from "react-router-dom";
import { HeartPulse, MessageSquarePlus, LifeBuoy, Bookmark } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { to: "/", label: "Find care", Icon: HeartPulse, end: true },
  { to: "/feedback", label: "Feedback", Icon: MessageSquarePlus, end: false },
  { to: "/support", label: "Support", Icon: LifeBuoy, end: false },
  { to: "/saved", label: "Saved", Icon: Bookmark, end: false },
] as const;

/** Mobile-first bottom tab bar (app shell). Centered, safe-area aware. */
export default function TabBar() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-lg
                 pb-[env(safe-area-inset-bottom)]"
      data-tour="tabbar"
    >
      <ul className="mx-auto flex max-w-2xl items-stretch justify-around">
        {TABS.map(({ to, label, Icon, end }) => (
          <li key={to} className="min-w-0 flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "group flex min-h-[3.5rem] w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold",
                  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset",
                  isActive ? "text-satya" : "text-ink-muted hover:text-ink",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "relative grid h-8 w-12 shrink-0 place-items-center rounded-full transition-colors",
                      isActive && "bg-satya/10",
                    )}
                  >
                    <Icon
                      size={22}
                      strokeWidth={isActive ? 2.4 : 2}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="max-w-full text-center leading-tight">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
