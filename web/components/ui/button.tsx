import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

// Hedgora pill buttons: cream primary / cream-tinted outline, both turn brand blue on hover.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-[0.025em] transition-[color,background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary font-semibold text-primary-foreground shadow-[0_2px_10px_rgba(0,0,0,.12)] hover:bg-brand hover:text-white hover:shadow-[0_12px_28px_rgba(11,83,191,.32)]",
        destructive: "bg-destructive font-semibold text-white hover:bg-destructive/85",
        outline:
          "border border-[color-mix(in_srgb,var(--tint)_26%,transparent)] bg-[color-mix(in_srgb,var(--tint)_3.5%,transparent)] text-foreground hover:border-[rgba(106,138,212,.72)] hover:bg-[rgba(11,83,191,.55)] hover:text-white hover:shadow-[0_10px_28px_rgba(11,83,191,.2)]",
        secondary:
          "border border-[color-mix(in_srgb,var(--tint)_12%,transparent)] bg-[color-mix(in_srgb,var(--tint)_13%,transparent)] text-foreground hover:bg-[rgba(11,83,191,.55)] hover:text-white",
        ghost: "text-muted-foreground hover:bg-overlay/5 hover:text-foreground hover:translate-y-0",
        link: "text-brand-soft underline-offset-4 hover:underline hover:translate-y-0",
      },
      size: {
        default: "min-h-[46px] px-5 text-[0.78rem]",
        sm: "min-h-[35px] px-3.5 text-[0.72rem]",
        lg: "min-h-[50px] px-7 text-[0.82rem] tracking-[0.06em]",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
