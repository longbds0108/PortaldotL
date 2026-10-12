import Image from "next/image";
import logoDark from "@/public/brand/hedgora-logo-dark.png";
import logo from "@/public/brand/hedgora-logo.png";
import { cn } from "@/lib/utils";

/**
 * Hedgora lockup (hexagon mark + wordmark), background keyed out from the supplied artwork.
 * `onLight` swaps in the dark-wordmark version for light surfaces (e.g. the landing header over light sections).
 */
export function BrandLogo({ onLight = false, className, priority = false }: { onLight?: boolean; className?: string; priority?: boolean }) {
  return (
    <Image
      src={onLight ? logoDark : logo}
      alt="Hedgora"
      priority={priority}
      className={cn("h-8 w-auto select-none", className)}
      draggable={false}
    />
  );
}
