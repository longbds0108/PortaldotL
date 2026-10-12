"use client";

import { useEffect, useRef, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef$#+*";

/** Text that resolves from random glyphs when scrolled into view (Hedgora TextScramble). */
export function Scramble({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState({ text, settled: text.length });

  useEffect(() => {
    const host = ref.current;
    if (!host || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const chars = Array.from(text);
    let raf = 0;
    const run = () => {
      const duration = Math.max(520, Math.min(820, chars.length * 18));
      const start = performance.now();
      const update = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        const settled = Math.floor(progress * chars.length);
        setDisplay({
          text: chars.map((c, i) => (c === " " || i < settled ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join(""),
          settled,
        });
        if (progress < 1) raf = requestAnimationFrame(update);
        else setDisplay({ text, settled: chars.length });
      };
      raf = requestAnimationFrame(update);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(host);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [text]);

  return (
    <span ref={ref} className="text-scramble" aria-label={text}>
      <span className="text-scramble__measure" aria-hidden="true">
        {text}
      </span>
      <span className="text-scramble__visual" aria-hidden="true">
        {Array.from(display.text).map((c, i) => (
          <span key={i} className={i >= display.settled && c !== " " ? "text-scramble__unresolved" : undefined}>
            {c}
          </span>
        ))}
      </span>
    </span>
  );
}
