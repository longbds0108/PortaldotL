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
          "group flex h-11 w-full items-center justify-between gap-2 rounded-full border border-white/10 bg-[#211c26] px-4 text-left text-[0.82rem] text-[#f1eef5] outline-none transition-[border-color,background-color] duration-200",
          "hover:border-white/20 hover:bg-[#252029] focus-visible:border-[rgba(131,170,255,.55)] data-[state=open]:border-[rgba(131,170,255,.55)] data-[placeholder]:text-muted-foreground",
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
          className="select-content z-50 max-h-[min(22rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-[11rem] overflow-hidden rounded-[16px] border border-white/10 bg-[#1a161f] p-1.5 text-[#f1eef5] shadow-[0_24px_60px_rgba(0,0,0,.45),0_0_0_1px_rgba(255,255,255,.02)]"
        >
          <SelectPrimitive.Viewport className="grid gap-0.5">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className={cn(
                  "relative flex cursor-pointer select-none items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-[0.84rem] text-[#cfcad6] outline-none transition-colors duration-150",
                  "data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-white data-[state=checked]:bg-[rgba(232,227,213,.08)] data-[state=checked]:text-[#f3efe5] data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
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
