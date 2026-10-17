"use client";

import { useEffect, useRef } from "react";

/**
 * Hero visual: a "wax seal" made of hex glyphs, i.e. a commitment hash you cannot read.
 * Ported from the original AsciiCoinField (github.com/longbds0108/Defi, src/landing/landingInit.ts):
 * same reveal, pointer parallax, cream→blue tint and travelling sheen; glyph set swapped to hex.
 */
const GLYPHS = "0123456789abcdef";
const FONT = 'ui-monospace, SFMono-Regular, Menlo, "JetBrains Mono", monospace';

type Cell = {
  baseX: number;
  baseY: number;
  nx: number;
  ny: number;
  noise: number;
  character: string;
  revealDistance: number;
  onOrbit: boolean;
};

function hash(x: number, y: number) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

export function AsciiSeal() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    let width = 0;
    let height = 0;
    let cellSize = 11;
    let cells: Cell[] = [];
    let frame = 0;
    let startTime = performance.now();
    let previous = startTime;
    let isVisible = true;
    let needsRedraw = true;

    function buildCells() {
      cellSize = width < 620 ? 9 : 11;
      const columns = Math.ceil(width / cellSize);
      const rows = Math.ceil(height / cellSize);
      const minSide = Math.min(width, height);
      const originX = width * 0.2;
      const originY = height * 0.65;
      const maxDistance = Math.hypot(width, height);
      const next: Cell[] = [];
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const baseX = column * cellSize + cellSize / 2;
          const baseY = row * cellSize + cellSize / 2;
          const nx = (baseX - width * 0.5) / minSide;
          const ny = (baseY - height * 0.5) / minSide;
          const orbitX = (nx + 0.02) / 0.51;
          const orbitY = (ny - 0.01) / 0.22;
          const orbitDistance = Math.sqrt(orbitX * orbitX + orbitY * orbitY);
          next.push({
            baseX,
            baseY,
            nx,
            ny,
            noise: hash(column, row),
            character: GLYPHS[Math.floor(hash(column + 17, row + 31) * GLYPHS.length)],
            revealDistance: Math.hypot(baseX - originX, baseY - originY) / maxDistance,
            onOrbit: Math.abs(orbitDistance - 1) < 0.018,
          });
        }
      }
      cells = next;
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
      startTime = performance.now();
      previous = startTime;
      needsRedraw = true;
    }

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.targetX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
      pointer.targetY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
      needsRedraw = true;
    };
    const onLeave = () => {
      pointer.targetX = 0;
      pointer.targetY = 0;
      needsRedraw = true;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    const CREAM = [232, 227, 213];
    const BLUE = [63, 145, 255];

    function draw(now: number) {
      frame = requestAnimationFrame(draw);
      if (!isVisible) {
        previous = now;
        return;
      }
      const elapsed = (now - startTime) / 1000;
      const reveal = reduced ? 1 : Math.min(1, elapsed / 1.45);
      const frameScale = Math.min(3, Math.max(0.25, (now - previous) / 16.667));
      const smoothing = 1 - Math.pow(0.9, frameScale);
      previous = now;
      pointer.x += (pointer.targetX - pointer.x) * smoothing;
      pointer.y += (pointer.targetY - pointer.y) * smoothing;
      const moving = Math.abs(pointer.targetX - pointer.x) > 0.0005 || Math.abs(pointer.targetY - pointer.y) > 0.0005;
      if (reduced && !needsRedraw && !moving && reveal >= 1) return;
      needsRedraw = false;

      context!.clearRect(0, 0, width, height);
      context!.font = `${Math.max(8, cellSize - 1)}px ${FONT}`;
      context!.textAlign = "center";
      context!.textBaseline = "middle";
      const sealRadius = 0.45;
      const sheenC = reduced ? 999 : ((now * 0.0003) % 1) * 2.6 - 1.3;

      for (const cell of cells) {
        const localX = cell.nx / sealRadius;
        const localY = cell.ny / sealRadius;
        const radius = Math.sqrt(localX * localX + localY * localY);
        const inside = radius <= 1;
        const bestDepth = inside ? Math.sqrt(1 - radius * radius) : -1;
        if (!inside && !cell.onOrbit) continue;
        const revealAlpha = Math.max(0, Math.min(1, (reveal * 1.45 - cell.revealDistance) * 4));
        if (revealAlpha <= 0) continue;
        if (inside && cell.noise > 0.79 + bestDepth * 0.18) continue;
        if (cell.onOrbit && cell.noise > 0.62) continue;
        const depth = inside ? bestDepth : 0.15;
        const px = pointer.x * depth * 18;
        const py = pointer.y * depth * 13;
        const character = cell.onOrbit && !inside ? "·" : cell.character;
        const alpha = revealAlpha * (cell.onOrbit && !inside ? 0.38 : 0.28 + depth * 0.72);
        if (inside) {
          const t = Math.max(0, Math.min(1, (localX + 1) / 2));
          let r = Math.round(CREAM[0] + (BLUE[0] - CREAM[0]) * t);
          let g = Math.round(CREAM[1] + (BLUE[1] - CREAM[1]) * t);
          let b = Math.round(CREAM[2] + (BLUE[2] - CREAM[2]) * t);
          let sheenA = 0;
          if (!reduced) {
            let sh = Math.max(0, 1 - Math.abs(localX - sheenC) / 0.42);
            sh = sh * sh * (3 - 2 * sh);
            r = Math.round(r + (255 - r) * sh);
            g = Math.round(g + (255 - g) * sh);
            b = Math.round(b + (255 - b) * sh);
            sheenA = sh * 0.9;
          }
          const edgeGlow = radius > 0.88 ? 1.18 : 1;
          context!.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha * edgeGlow + sheenA)})`;
        } else {
          context!.fillStyle = `rgba(232, 227, 213, ${alpha})`;
        }
        context!.fillText(character, cell.baseX + px, cell.baseY + py);
      }
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0].isIntersecting;
        if (isVisible) needsRedraw = true;
      },
      { rootMargin: "100px" },
    );
    io.observe(canvas);
    resize();
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="bb-ascii" role="img" aria-label="A seal made of hexadecimal characters, like a sealed commitment hash">
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
