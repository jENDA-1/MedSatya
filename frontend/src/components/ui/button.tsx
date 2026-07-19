import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 text-center rounded-xl text-sm font-semibold " +
    "transition-[transform,background-color,box-shadow,border-color] duration-150 " +
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-canvas select-none",
  {
    variants: {
      variant: {
        primary: "bg-satya text-white hover:bg-satya-600 shadow-soft",
        navy: "bg-navy text-white hover:bg-navy-700 shadow-soft",
        gold: "bg-gold text-navy hover:brightness-105 shadow-soft",
        outline: "border border-line bg-surface text-ink hover:bg-surface-raised",
        ghost: "text-ink hover:bg-ink/5",
        subtle: "bg-ink/5 text-ink hover:bg-ink/10",
        danger: "bg-evidence-contradictory text-white hover:brightness-95 shadow-soft",
      },
      size: {
        sm: "min-h-[36px] px-3 py-1.5",
        md: "min-h-[44px] px-4 py-2",
        lg: "min-h-[52px] px-6 text-base",
        icon: "h-11 w-11 shrink-0",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
