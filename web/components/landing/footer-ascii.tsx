"use client";

import { useEffect, useRef } from "react";

/**
 * Footer wave of glyphs that meets in the middle; hover lights it, click/Enter sends a colour pulse.
 * Ported from Hedgora's FooterAsciiField (github.com/longbds0108/Defi, src/landing/landingInit.ts).
 */
const GLYPHS = "HEDGORA0123456789abcdef$#◆+*:";
const FONT = 'ui-monospace, SFMono-Regular, Menlo, "JetBrains Mono", monospace';

type Pt = { x: number; y: number };
type Cell = { x: number; y: number; character: string; baseAlpha: number; revealThreshold: number };

const hash = (x: number, y: number) => {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const clamp = (v: number, mn = 0, mx = 1) => Math.max(mn, Math.min(mx, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function cubicPoint(p: number, s: Pt, a: Pt, b: Pt, e: Pt): Pt {
  const i = 1 - p;
  return {
    x: i * i * i * s.x + 3 * i * i * p * a.x + 3 * i * p * p * b.x + p * p * p * e.x,
    y: i * i * i * s.y + 3 * i * i * p * a.y + 3 * i * p * p * b.y + p * p * p * e.y,
  };
}
function cubicTangent(p: number, s: Pt, a: Pt, b: Pt, e: Pt): Pt {
  const i = 1 - p;
  return {
    x: 3 * i * i * (a.x - s.x) + 6 * i * p * (b.x - a.x) + 3 * p * p * (e.x - b.x),
    y: 3 * i * i * (a.y - s.y) + 6 * i * p * (b.y - a.y) + 3 * p * p * (e.y - b.y),
  };
}

export function FooterAscii() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !wrap || !context) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const CREAM = [232, 227, 213];
    const BLUE = [63, 145, 255];
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, glow: 0, targetGlow: 0 };
    let width = 0;
    let height = 0;
    let cellSize = 10;
    let cells: Cell[] = [];
    let frame = 0;
    let previous = performance.now();
    let revealStartedAt = 0;
    let hasRevealed = false;
    let isVisible = false;
    let needsRedraw = true;
    let sweepStartedAt = 0;
    let isSweeping = false;
    const sweepDuration = reduced ? 700 : 1600;

    function buildCells() {
      if (width <= 0 || height <= 0) return;
      cellSize = width < 680 ? 8 : 10;
      const map = new Map<string, Cell>();
      const streams = [
        { start: { x: -width * 0.04, y: height * 0.5 }, a: { x: width * 0.12, y: height * 0.88 }, b: { x: width * 0.34, y: height * 0.88 }, end: { x: width * 0.5, y: height * 0.5 }, side: 0 },
        { start: { x: width * 1.04, y: height * 0.5 }, a: { x: width * 0.88, y: height * 0.12 }, b: { x: width * 0.66, y: height * 0.12 }, end: { x: width * 0.5, y: height * 0.5 }, side: 1 },
      ];
      const laneCount = width < 680 ? 5 : 7;
      const laneMiddle = (laneCount - 1) / 2;
      const sampleCount = Math.max(100, Math.round(width * 0.13));
      for (const s of streams) {
        for (let lane = 0; lane < laneCount; lane += 1) {
          const laneDistance = lane - laneMiddle;
          const laneFade = 1 - Math.abs(laneDistance) / (laneMiddle + 1.5);
          for (let sample = 0; sample <= sampleCount; sample += 1) {
            if (s.side === 1 && sample === sampleCount) continue;
            const progress = sample / sampleCount;
            const point = cubicPoint(progress, s.start, s.a, s.b, s.end);
            const tangent = cubicTangent(progress, s.start, s.a, s.b, s.end);
            const len = Math.max(1, Math.hypot(tangent.x, tangent.y));
            const laneOffset = laneDistance * cellSize * (1.1 + Math.sin(progress * Math.PI) * 0.75);
            const x = point.x + (-tangent.y / len) * laneOffset;
            const y = point.y + (tangent.x / len) * laneOffset;
            if (x < -cellSize || x > width + cellSize || y < 0 || y > height) continue;
            const column = Math.round(x / cellSize);
            const row = Math.round(y / cellSize);
            const key = `${s.side}:${column}:${row}`;
            const noise = hash(column + s.side * 101, row + lane * 17);
            if (noise > 0.9) continue;
            const edgeFade = clamp(Math.sin(progress * Math.PI) * 1.35 + 0.18);
            const baseAlpha = (0.24 + noise * 0.58) * laneFade * edgeFade;
            const existing = map.get(key);
            if (!existing || baseAlpha > existing.baseAlpha) {
              map.set(key, {
                x: column * cellSize,
                y: row * cellSize,
                character:
                  sample % Math.max(12, Math.round(sampleCount / 9)) === 0
                    ? "◆"
                    : GLYPHS[Math.floor(hash(column + 41, row + 73 + s.side * 31) * GLYPHS.length)],
                baseAlpha,
                revealThreshold: progress * 0.9 + Math.abs(laneDistance) * 0.018,
              });
            }
          }
        }
      }
      cells = [...map.values()];
      needsRedraw = true;
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.max(1, Math.floor(width * dpr));
      canvas!.height = Math.max(1, Math.floor(height * dpr));
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildCells();
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!isVisible) return;
      const rect = canvas.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) {
        pointer.targetGlow = 0;
        needsRedraw = true;
        return;
      }
      pointer.targetX = event.clientX - rect.left;
      pointer.targetY = event.clientY - rect.top;
      if (pointer.glow < 0.01) {
        pointer.x = pointer.targetX;
        pointer.y = pointer.targetY;
      }
      pointer.targetGlow = 1;
      needsRedraw = true;
    };
    const sweep = () => {
      if (isSweeping) return;
      sweepStartedAt = performance.now();
      isSweeping = true;
      needsRedraw = true;
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      sweep();
    };

    function draw(now: number) {
      frame = requestAnimationFrame(draw);
      if (!isVisible || !hasRevealed) {
        previous = now;
        return;
      }
      const frameScale = Math.min(3, Math.max(0.25, (now - previous) / 16.667));
      const smoothing = 1 - Math.pow(0.86, frameScale);
      previous = now;
      pointer.x += (pointer.targetX - pointer.x) * smoothing;
      pointer.y += (pointer.targetY - pointer.y) * smoothing;
      pointer.glow += (pointer.targetGlow - pointer.glow) * smoothing;
      const revealProgress = reduced ? 1 : clamp((now - revealStartedAt) / 1700);
      const moving =
        Math.abs(pointer.targetX - pointer.x) > 0.15 ||
        Math.abs(pointer.targetY - pointer.y) > 0.15 ||
        Math.abs(pointer.targetGlow - pointer.glow) > 0.005;
      let sweepProgress = 1;
      if (isSweeping) {
        sweepProgress = clamp((now - sweepStartedAt) / sweepDuration);
        if (sweepProgress >= 1) isSweeping = false;
      }
      if (reduced && !needsRedraw && revealProgress >= 1 && !moving && !isSweeping) return;
      needsRedraw = false;

      context!.clearRect(0, 0, width, height);
      context!.font = `${Math.max(8, cellSize - 1)}px ${FONT}`;
      context!.textAlign = "center";
      context!.textBaseline = "middle";
      const spotlightRadius = width < 680 ? 48 : 72;
      const autoCenter = reduced ? -999 : 0.5 + 0.78 * Math.sin(now * 0.0031416);

      for (const cell of cells) {
        const revealAlpha = clamp((revealProgress * 1.38 - cell.revealThreshold) * 4.2);
        if (revealAlpha <= 0) continue;
        const spotlight = Math.pow(clamp(1 - Math.hypot(cell.x - pointer.x, cell.y - pointer.y) / spotlightRadius), 4) * pointer.glow;
        const hp = clamp(cell.x / Math.max(1, width));
        let autoPulse = 0;
        if (!reduced) {
          const raw = clamp(1 - Math.abs(hp - autoCenter) / 0.4);
          autoPulse = raw * raw * (3 - 2 * raw) * 0.5;
        }
        let colorPulse = autoPulse;
        if (isSweeping) {
          const pulse = clamp(1 - Math.abs(hp - lerp(-0.24, 1.24, sweepProgress)) / 0.26);
          colorPulse = Math.max(colorPulse, pulse * pulse * (3 - 2 * pulse));
        }
        const cp = lerp(hp, 1 - hp, colorPulse);
        const lit = spotlight * (isSweeping ? 0.12 : 1) + autoPulse * 0.25;
        const r = Math.round(lerp(CREAM[0], BLUE[0], cp));
        const g = Math.round(lerp(CREAM[1], BLUE[1], cp));
        const b = Math.round(lerp(CREAM[2], BLUE[2], cp));
        const alpha = clamp((cell.baseAlpha + lit * 0.42 + colorPulse * 0.18) * revealAlpha);
        context!.fillStyle = `rgba(${Math.round(r + (245 - r) * lit)}, ${Math.round(g + (243 - g) * lit)}, ${Math.round(b + (247 - b) * lit)}, ${alpha})`;
        context!.fillText(cell.character, cell.x, cell.y);
      }
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0].isIntersecting;
        if (isVisible && !hasRevealed) {
          hasRevealed = true;
          revealStartedAt = performance.now();
        }
        if (isVisible) needsRedraw = true;
      },
      { threshold: 0.08 },
    );
    io.observe(wrap);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    wrap.addEventListener("click", sweep);
    wrap.addEventListener("keydown", onKey);
    resize();
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      wrap.removeEventListener("click", sweep);
      wrap.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="bb-footer__ascii"
      role="button"
      tabIndex={0}
      aria-label="Play a left-to-right colour pulse across the glyph wave"
    >
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
