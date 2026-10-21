"use client";

import { useEffect } from "react";

/**
 * Marks <html data-scrolling> while the user scrolls (any scroller, including the sidebar) and for a moment after.
 * globals.css pauses the decorative sheen animations under it, so scroll frames are not spent repainting card borders.
 */
export function ScrollIdle() {
  useEffect(() => {
    const root = document.documentElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (timer === undefined) root.dataset.scrolling = "";
      else clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        delete root.dataset.scrolling;
      }, 160);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      clearTimeout(timer);
      delete root.dataset.scrolling;
    };
  }, []);
  return null;
}
