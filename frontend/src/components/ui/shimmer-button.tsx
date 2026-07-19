import { forwardRef, type CSSProperties } from "react";
import { cn } from "@/lib/cn";

/**
 * Magic UI-style shimmer CTA, adapted to MedSatya brand.
 * A rotating gold shimmer sweeps the border of a solid navy button.
 * Animations are pure CSS (keyframes in tailwind.config) so they auto-stop
 * under prefers-reduced-motion / the in-app reduce-motion toggle.
 */
export interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
}

export const ShimmerButton = forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor = "#E7C56A",
      shimmerSize = "0.06em",
      shimmerDuration = "2.8s",
      borderRadius = "999px",
      background = "linear-gradient(180deg, #0C2A6B 0%, #071B4F 100%)",
      className,
      children,
      type = "button",
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      style={
        {
          "--spread": "90deg",
          "--shimmer-color": shimmerColor,
          "--radius": borderRadius,
          "--speed": shimmerDuration,
          "--cut": shimmerSize,
          "--bg": background,
        } as CSSProperties
      }
      className={cn(
        "group relative z-0 flex max-w-full cursor-pointer flex-wrap items-center justify-center overflow-hidden",
        "border border-white/10 px-5 py-3.5 text-center text-base font-semibold text-white sm:px-8",
        "[background:var(--bg)] [border-radius:var(--radius)] shadow-lift",
        "transition-transform duration-200 active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        className,
      )}
      {...props}
    >
      {/* spark container */}
      <div className="-z-30 blur-[2px] absolute inset-0 overflow-visible [container-type:size]">
        <div className="absolute inset-0 h-[100cqh] animate-shimmer-slide [aspect-ratio:1] [border-radius:0] [mask:none]">
          <div className="absolute -inset-full w-auto rotate-0 animate-spin-around [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))] [translate:0_0]" />
        </div>
      </div>
      {children}
      {/* subtle top highlight */}
      <div className="pointer-events-none absolute inset-0 [border-radius:var(--radius)] shadow-[inset_0_-8px_10px_#ffffff1f] group-hover:shadow-[inset_0_-6px_10px_#ffffff33]" />
      {/* backdrop that masks the spark, leaving only the border shimmer */}
      <div className="absolute -z-20 [background:var(--bg)] [border-radius:var(--radius)] [inset:var(--cut)]" />
    </button>
  ),
);
ShimmerButton.displayName = "ShimmerButton";
