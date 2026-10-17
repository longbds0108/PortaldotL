import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

// Plinths info-panel: recessed surface with a soft radial tint.
const alertVariants = cva("flex gap-3 rounded-[16px] border p-4 text-[0.82rem] leading-relaxed [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0", {
  variants: {
    variant: {
      default: "well",
      info: "border-[rgba(113,161,232,.16)] bg-[radial-gradient(circle_at_0_0,rgba(54,112,190,.16),transparent_65%),var(--well)] text-foreground-soft [&>svg]:text-link",
      warning: "border-[rgba(232,181,76,.25)] bg-[radial-gradient(circle_at_0_0,rgba(232,181,76,.1),transparent_65%),var(--well)] [&>svg]:text-warning",
      destructive: "border-[rgba(229,72,77,.3)] bg-[rgba(229,72,77,.07)] text-destructive-fg",
      success: "border-[rgba(79,209,197,.22)] bg-[rgba(79,209,197,.06)] [&>svg]:text-success",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Alert({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}
