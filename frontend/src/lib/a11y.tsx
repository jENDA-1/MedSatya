import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Accessibility preferences store.
 * Applies `data-*` attributes on <html> that src/index.css reacts to:
 *   data-theme="hc"      → high-contrast (WCAG AAA) theme
 *   data-font="lg"|"xl"  → font scaler (A+ / A++)
 *   data-cvd="1"         → colourblind-safe (Okabe–Ito) evidence palette
 *   data-reduce-motion="1" → disable animations (in addition to OS setting)
 * Preferences persist to localStorage so the choice survives reloads.
 */

export type FontScale = "a" | "lg" | "xl";

export interface A11yState {
  highContrast: boolean;
  font: FontScale;
  colorblind: boolean;
  reduceMotion: boolean;
}

const DEFAULT: A11yState = {
  highContrast: false,
  font: "a",
  colorblind: false,
  reduceMotion: false,
};

const STORAGE_KEY = "medsatya.a11y.v1";

function load(): A11yState {
  if (typeof localStorage === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<A11yState>) };
  } catch {
    return DEFAULT;
  }
}

function apply(state: A11yState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", state.highContrast ? "hc" : "normal");
  if (state.font === "a") root.removeAttribute("data-font");
  else root.setAttribute("data-font", state.font);
  if (state.colorblind) root.setAttribute("data-cvd", "1");
  else root.removeAttribute("data-cvd");
  if (state.reduceMotion) root.setAttribute("data-reduce-motion", "1");
  else root.removeAttribute("data-reduce-motion");
}

interface A11yContextValue extends A11yState {
  setHighContrast: (v: boolean) => void;
  setFont: (v: FontScale) => void;
  setColorblind: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
  cycleFont: () => void;
  reset: () => void;
  /** True when any accessibility override is active (drives the toolbar badge). */
  active: boolean;
}

const A11yContext = createContext<A11yContextValue | null>(null);

const FONT_ORDER: FontScale[] = ["a", "lg", "xl"];

export function A11yProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<A11yState>(() => load());

  useEffect(() => {
    apply(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [state]);

  const patch = useCallback((p: Partial<A11yState>) => setState((s) => ({ ...s, ...p })), []);

  const value = useMemo<A11yContextValue>(
    () => ({
      ...state,
      active:
        state.highContrast || state.colorblind || state.font !== "a" || state.reduceMotion,
      setHighContrast: (v) => patch({ highContrast: v }),
      setFont: (v) => patch({ font: v }),
      setColorblind: (v) => patch({ colorblind: v }),
      setReduceMotion: (v) => patch({ reduceMotion: v }),
      cycleFont: () =>
        setState((s) => ({
          ...s,
          font: FONT_ORDER[(FONT_ORDER.indexOf(s.font) + 1) % FONT_ORDER.length],
        })),
      reset: () => setState(DEFAULT),
    }),
    [state, patch],
  );

  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
}

export function useA11y(): A11yContextValue {
  const ctx = useContext(A11yContext);
  if (!ctx) throw new Error("useA11y must be used within <A11yProvider>");
  return ctx;
}

/** Standalone hook to check reduced-motion (OS setting OR in-app toggle). */
export function usePrefersReducedMotion(): boolean {
  const { reduceMotion } = useA11y();
  const [osReduce, setOsReduce] = useState(false);
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    setOsReduce(mq.matches);
    const on = () => setOsReduce(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduceMotion || osReduce;
}
