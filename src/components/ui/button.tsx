import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  /* Base: explicit transition-colors (not transition-all) + motion-safe guard.
     Focus ring: global :focus-visible in index.css handles the 2px accent outline
     uniformly across ALL interactive elements — no per-element ring-* needed here.
     Per spec §8: single source of truth for focus indicators. */
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-ui text-sm font-medium motion-safe:transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        /* Neutral primary — no glow. Use for secondary actions, pagination, cancel-adjacent confirms. */
        default:
          "bg-primary text-primary-foreground hover:bg-[var(--color-accent-deep)]",
        /* Primary CTA — accent glow on hover (only place glow is allowed per spec §4). */
        cta:
          "bg-primary text-primary-foreground hover:bg-[var(--color-accent-deep)] hover:shadow-[0_0_16px_rgba(242,95,45,0.25)]",
        ghost:
          "hover:bg-white/5 text-foreground",
        outline:
          "border border-white/20 text-muted-foreground hover:bg-white/5",
        /* Outline-only — no red fill at idle (spec §4A). bg-transparent on idle,
           subtle error/8 tint on hover only. Red fill is reserved for status badges. */
        destructive:
          "border border-[var(--color-error)] text-[var(--color-error-text)] bg-transparent hover:bg-[var(--color-error)]/8",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        sm:      "h-8 px-3 text-xs",
        lg:      "h-11 px-6",
        icon:    "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
