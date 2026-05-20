import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex w-full rounded-sm border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground",
          /* focus:outline-none removed — global :focus-visible in index.css applies the
             accent outline. Border-color change kept as secondary visual indicator. */
          "focus:border-primary motion-safe:transition-colors duration-150",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
