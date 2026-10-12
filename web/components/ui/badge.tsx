import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

// Hedgora status-pill: thin border, tinted text, optional glowing dot.
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.68rem] font-medium",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-[rgba(131,170,255,.25)] text-[#c3d6ff]",
        outline: "border-[rgba(255,255,255,.12)] text-[#d6d1d9]",
        success: "border-[rgba(79,209,197,.22)] text-[#a2c9c2]",
        warning: "border-[rgba(232,181,76,.28)] text-[#ecc979]",
        destructive: "border-[rgba(229,72,77,.3)] text-[#f08a8d]",
        muted: "border-[rgba(255,255,255,.1)] text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const DOT: Partial<Record<NonNullable<VariantProps<typeof badgeVariants>["variant"]>, string>> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  secondary: "text-brand-soft",
};

export function Badge({
  className,
  variant,
  dot,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <i className={cn("status-dot", (variant && DOT[variant]) || "text-muted-foreground")} />}
      {children}
    </span>
  );
}
