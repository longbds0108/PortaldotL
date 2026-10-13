"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

/**
 * Styled dropdown (Radix Select, as used by shadcn/ui) replacing the native <select>, whose menu is drawn by
 * the OS and cannot match the app. Keyboard and screen-reader support come from Radix.
 * Solid background on purpose: WebKit bleeds the card text through a backdrop-filter stacked over a blurred card.
 * Note: Radix does not allow an empty-string item value — map "unset" to a sentinel such as "none".
 */
export function SelectMenu({
  value,
  onValueChange,
  options,
  id,
  ariaLabel,
  placeholder,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "group flex h-11 w-full items-center justify-between gap-2 rounded-full border border-overlay/10 bg-field px-4 text-left text-[0.82rem] text-foreground outline-none transition-[border-color,background-color] duration-200",
          "hover:border-overlay/20 hover:bg-field-hover focus-visible:border-[rgba(131,170,255,.55)] data-[state=open]:border-[rgba(131,170,255,.55)] data-[placeholder]:text-muted-foreground",
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={8}
          className="select-content z-50 max-h-[min(22rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-[11rem] overflow-hidden rounded-[16px] border border-overlay/10 bg-popover p-1.5 text-foreground shadow-[0_24px_60px_var(--popover-shadow)]"
        >
          <SelectPrimitive.Viewport className="grid gap-0.5">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className={cn(
                  "relative flex cursor-pointer select-none items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-[0.84rem] text-foreground-soft outline-none transition-colors duration-150",
                  "data-[highlighted]:bg-overlay/[0.06] data-[highlighted]:text-white data-[state=checked]:bg-[color-mix(in_srgb,var(--tint)_8%,transparent)] data-[state=checked]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
                )}
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="size-4 text-brand-soft" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
