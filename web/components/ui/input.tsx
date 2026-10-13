import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "well flex h-11 w-full rounded-md px-3.5 py-2 text-sm text-foreground placeholder:text-[#625e69] transition-colors focus-visible:border-[rgba(131,170,255,.55)] focus-visible:outline-none disabled:opacity-50 [color-scheme:dark]",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "well flex min-h-24 w-full rounded-md px-3.5 py-2.5 text-sm text-foreground placeholder:text-[#625e69] transition-colors focus-visible:border-[rgba(131,170,255,.55)] focus-visible:outline-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";


export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[0.78rem] font-medium leading-none text-[#e0dce5]", className)} {...props} />;
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-xs text-destructive">{children}</p>;
}
