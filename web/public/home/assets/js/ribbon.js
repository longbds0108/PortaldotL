/*
 * Plinths light ribbon.
 *
 * One bundle of fine light strands follows a spine (Catmull-Rom through five points). The bundle pinches to a
 * white-hot point where it bends and fans out towards both ends; strands sway slightly and carry bright packets
 * that travel along them. Every page section names a "scene" (data-scene); while scrolling, the spine eases from
 * one scene to the next, so the ribbon appears to flow down the page with the content.
 *
 * Two canvases: a sharp one at device resolution, and a tiny bloom canvas (1/8 size, upscaled + CSS blur) that
 * receives a copy of the sharp frame plus a few wide, faint "aurora" strokes. Upscaling does most of the blur
 * for free.
 */
(function () {
  "use strict";

  const canvas = document.getElementById("ribbon");
  const bloom = document.getElementById("ribbon-bloom");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const bctx = bloom.getContext("2d");

  const reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const SAMPLES = 80;
  const BLOOM_SCALE = 8;

  /*
   * Scenes, in viewport units (x: 0..1 of width, y: 0..1 of height).
   * pinch: where along the spine the bundle is narrowest; w0/w1: half-width at the pinch / at the ends (in units of
   * the viewport's short side); glow: hot-spot strength; aur: aurora haze; lum: overall strand brightness.
   */
  const SCENES = {
    hero: { pts: [[1.12, 1.16], [0.72, 1.02], [0.455, 0.83], [0.63, 0.5], [1.14, 0.1]], pinch: 0.5, w0: 0.004, w1: 0.2, glow: 1, aur: 0.15, lum: 1 },
    stack: { pts: [[1.12, -0.12], [0.88, 0.2], [0.7, 0.5], [0.8, 0.84], [1.12, 1.12]], pinch: 0.52, w0: 0.012, w1: 0.17, glow: 0.75, aur: 0.25, lum: 0.95 },
    statement: { pts: [[1.12, 0.02], [0.82, 0.24], [0.52, 0.55], [0.24, 0.86], [-0.12, 1.12]], pinch: 0.58, w0: 0.03, w1: 0.24, glow: 0.5, aur: 0.45, lum: 0.75 },
    features: { pts: [[-0.16, 0.98], [0.18, 0.76], [0.5, 0.56], [0.78, 0.3], [1.16, 0.04]], pinch: 0.42, w0: 0.08, w1: 0.34, glow: 0.22, aur: 0.95, lum: 0.42 },
    product: { pts: [[-0.12, 0.9], [0.24, 0.8], [0.54, 0.86], [0.8, 0.77], [1.12, 0.62]], pinch: 0.52, w0: 0.02, w1: 0.2, glow: 0.6, aur: 0.6, lum: 0.8 },
    seal: { pts: [[-0.12, 0.2], [0.2, 0.42], [0.5, 0.5], [0.8, 0.58], [1.12, 0.8]], pinch: 0.5, w0: 0.03, w1: 0.32, glow: 0.35, aur: 0.7, lum: 0.55 },
    trust: { pts: [[1.12, -0.1], [0.98, 0.22], [0.94, 0.56], [0.99, 0.86], [1.12, 1.12]], pinch: 0.5, w0: 0.012, w1: 0.17, glow: 0.7, aur: 0.3, lum: 0.85 },
    desk: { pts: [[1.16, 0.96], [0.82, 0.74], [0.5, 0.6], [0.2, 0.32], [-0.16, 0.06]], pinch: 0.45, w0: 0.08, w1: 0.34, glow: 0.2, aur: 0.9, lum: 0.4 },
    numbers: { pts: [[-0.12, 1.1], [0.24, 1.02], [0.5, 1.06], [0.76, 1.0], [1.12, 1.08]], pinch: 0.5, w0: 0.008, w1: 0.14, glow: 0.6, aur: 0.35, lum: 0.85 },
    how: { pts: [[-0.12, 0.66], [0.24, 0.55], [0.5, 0.58], [0.76, 0.5], [1.12, 0.4]], pinch: 0.5, w0: 0.01, w1: 0.12, glow: 0.55, aur: 0.3, lum: 0.85 },
    cta: { pts: [[-0.12, 1.06], [0.22, 0.64], [0.5, 0.42], [0.78, 0.64], [1.12, 1.06]], pinch: 0.5, w0: 0.004, w1: 0.26, glow: 1.15, aur: 0.35, lum: 1 },
    footer: { pts: [[-0.12, 1.25], [0.3, 1.06], [0.5, 1.0], [0.7, 1.06], [1.12, 1.25]], pinch: 0.5, w0: 0.02, w1: 0.3, glow: 0.4, aur: 0.35, lum: 0.6 },
  };
  // Phones: the hero dashboard sits under the copy, so the bend moves down and left.
  const MOBILE = {
    hero: { pts: [[1.2, 1.08], [0.72, 1.0], [0.2, 0.84], [0.62, 0.66], [1.25, 0.5]], pinch: 0.5, w0: 0.006, w1: 0.22, glow: 0.9, aur: 0.2, lum: 0.95 },
    stack: { pts: [[1.2, -0.1], [0.9, 0.25], [0.72, 0.5], [0.86, 0.8], [1.2, 1.1]], pinch: 0.52, w0: 0.02, w1: 0.2, glow: 0.6, aur: 0.25, lum: 0.8 },
    numbers: { pts: [[1.2, -0.1], [1.0, 0.3], [0.94, 0.55], [1.02, 0.8], [1.2, 1.1]], pinch: 0.5, w0: 0.01, w1: 0.12, glow: 0.4, aur: 0.25, lum: 0.6 },
  };

  // Brand palette: deep brand blue -> sky -> cyan, with a few cream strands (the app's accent).
  const PALETTE = [
    { rgb: [11, 83, 191], w: 0.24 },
    { rgb: [63, 145, 255], w: 0.3 },
    { rgb: [131, 170, 255], w: 0.17 },
    { rgb: [95, 205, 255], w: 0.19 },
    { rgb: [232, 227, 213], w: 0.1 },
  ];

  let W = 0, H = 0, DPR = 1, mobile = false;
  let strands = [];
  let sections = [];
  let time = 0;
  let last = performance.now();
  let intro = reduceMQ.matches ? 1 : 0; // 0 -> 1: light shoots out of the pinch on load
  let boost = 0, boostTarget = 0; // CTA hover flare
  let pointerX = 0.5, pointerY = 0.5, px = 0.5, py = 0.5;
  let dirty = true;

  const cur = cloneScene(SCENES.hero);
  const target = cloneScene(SCENES.hero);

  // Work buffers
  const sx = new Float32Array(SAMPLES + 1), sy = new Float32Array(SAMPLES + 1);
  const nx = new Float32Array(SAMPLES + 1), ny = new Float32Array(SAMPLES + 1);
  const spread = new Float32Array(SAMPLES + 1);
  const xs = new Float32Array(SAMPLES + 1), ys = new Float32Array(SAMPLES + 1);

  function cloneScene(s) {
    return { pts: s.pts.map((p) => p.slice()), pinch: s.pinch, w0: s.w0, w1: s.w1, glow: s.glow, aur: s.aur, lum: s.lum };
  }

  function sceneFor(name) {
    return (mobile && MOBILE[name]) || SCENES[name] || SCENES.hero;
  }

  function pickColor(r) {
    let acc = 0;
    for (const c of PALETTE) {
      acc += c.w;
      if (r <= acc) return c.rgb;
    }
    return PALETTE[1].rgb;
  }

  function buildStrands() {
    const n = mobile ? 52 : 104;
    strands = [];
    for (let i = 0; i < n; i++) {
      // Roughly normal distribution: denser core, sparse edges.
      const o = ((Math.random() + Math.random() + Math.random()) / 3) * 2 - 1;
      const rgb = pickColor(Math.random());
      const cream = rgb[0] > 200;
      const thick = Math.random() < 0.08;
      strands.push({
        o: o * 1.15,
        rgb,
        a: (cream ? 0.07 : 0.1) + Math.random() * (cream ? 0.1 : 0.2),
        w: thick ? 1.6 + Math.random() * 0.8 : 0.45 + Math.random() * 0.9,
        f: 4 + Math.random() * 7, // sway frequency along the spine
        ws: 0.25 + Math.random() * 0.6, // sway speed
        ph: Math.random() * Math.PI * 2,
        sp: 0.035 + Math.random() * 0.09, // packet speed (spine lengths per second)
        dp: Math.random() * 1.5,
        dl: 0.05 + Math.random() * 0.16, // packet length
        dir: Math.random() < 0.82 ? 1 : -1,
      });
    }
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    const wasMobile = mobile;
    mobile = W < 760;
    DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    bloom.width = Math.max(1, Math.round(W / BLOOM_SCALE));
    bloom.height = Math.max(1, Math.round(H / BLOOM_SCALE));
    if (wasMobile !== mobile || !strands.length) buildStrands();
    sections = Array.from(document.querySelectorAll("[data-scene]"));
    dirty = true;
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const mix = (a, b, t) => a + (b - a) * t;

  /** Target scene from scroll position: hold a section's scene, morph into the next over its second half. */
  function updateTarget() {
    if (!sections.length) return;
    const line = H * 0.5;
    let k = 0;
    for (let i = 0; i < sections.length; i++) if (sections[i].getBoundingClientRect().top <= line) k = i;
    const r = sections[k].getBoundingClientRect();
    const p = clamp((line - r.top) / Math.max(1, r.height), 0, 1);
    const a = sceneFor(sections[k].dataset.scene);
    const nextEl = sections[k + 1];
    const b = nextEl ? sceneFor(nextEl.dataset.scene) : a;
    const t = nextEl ? smooth(0.5, 1, p) : 0;
    const drift = -p * 0.22 * (1 - t); // ride up with the content a little while a scene holds

    for (let i = 0; i < 5; i++) {
      target.pts[i][0] = mix(a.pts[i][0], b.pts[i][0], t);
      target.pts[i][1] = mix(a.pts[i][1] + drift, b.pts[i][1], t);
    }
    for (const key of ["pinch", "w0", "w1", "glow", "aur", "lum"]) target[key] = mix(a[key], b[key], t);
  }

  function ease(dt, snap) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 3.2);
    for (let i = 0; i < 5; i++) {
      cur.pts[i][0] += (target.pts[i][0] - cur.pts[i][0]) * k;
      cur.pts[i][1] += (target.pts[i][1] - cur.pts[i][1]) * k;
    }
    for (const key of ["pinch", "w0", "w1", "glow", "aur", "lum"]) cur[key] += (target[key] - cur[key]) * k;
    const pk = snap ? 1 : 1 - Math.exp(-dt * 2);
    px += (pointerX - px) * pk;
    py += (pointerY - py) * pk;
    boost += (boostTarget - boost) * (snap ? 1 : 1 - Math.exp(-dt * 5));
  }

  /** Sample the spine (Catmull-Rom, uniform over 4 segments) into sx/sy, normals and half-widths. */
  function sampleSpine() {
    const P = cur.pts;
    const short = Math.min(W, H) * DPR;
    // A touch of pointer parallax, strongest at the pinch.
    const mx = (px - 0.5) * 0.03, my = (py - 0.5) * 0.03;
    for (let i = 0; i <= SAMPLES; i++) {
      const u = (i / SAMPLES) * 4;
      const seg = Math.min(3, Math.floor(u));
      const t = u - seg;
      const p0 = P[Math.max(0, seg - 1)], p1 = P[seg], p2 = P[seg + 1], p3 = P[Math.min(4, seg + 2)];
      const t2 = t * t, t3 = t2 * t;
      const cx = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const cy = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      const near = 1 - Math.min(1, Math.abs(i / SAMPLES - cur.pinch) * 2.2);
      sx[i] = (cx + mx * near) * W * DPR;
      sy[i] = (cy + my * near) * H * DPR;
      const d = smooth(0, 0.55, Math.abs(i / SAMPLES - cur.pinch));
      spread[i] = mix(cur.w0, cur.w1, Math.pow(d, 0.85)) * short;
    }
    for (let i = 0; i <= SAMPLES; i++) {
      const a = Math.max(0, i - 1), b = Math.min(SAMPLES, i + 1);
      let dx = sx[b] - sx[a], dy = sy[b] - sy[a];
      const len = Math.hypot(dx, dy) || 1;
      nx[i] = -dy / len;
      ny[i] = dx / len;
    }
  }

  function strandPoints(s, from, to) {
    for (let i = from; i <= to; i++) {
      const t = i / SAMPLES;
      const sp = spread[i];
      const off = s.o * sp + Math.sin(t * s.f + time * s.ws + s.ph) * sp * 0.13;
      xs[i] = sx[i] + nx[i] * off;
      ys[i] = sy[i] + ny[i] * off;
    }
  }

  function strokeRange(from, to) {
    ctx.beginPath();
    ctx.moveTo(xs[from], ys[from]);
    for (let i = from + 1; i <= to; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.stroke();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    sampleSpine();

    const introE = 1 - Math.pow(1 - intro, 3);
    const lum = cur.lum * (0.25 + 0.75 * introE) * (1 + boost * 0.35);
    // Light shoots out of the pinch during the intro.
    const reach = 0.04 + introE * 0.96;
    const pinchI = Math.round(cur.pinch * SAMPLES);
    const lo = Math.max(0, Math.round((cur.pinch - reach) * SAMPLES));
    const hi = Math.min(SAMPLES, Math.round((cur.pinch + reach) * SAMPLES));

    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const s of strands) {
      strandPoints(s, lo, hi);
      const [r, g, b] = s.rgb;
      ctx.lineWidth = s.w * DPR;
      ctx.strokeStyle = `rgba(${r},${g},${b},${(s.a * lum).toFixed(3)})`;
      strokeRange(lo, hi);

      // Travelling packet
      let u = (s.dp + time * s.sp) % 1.5;
      if (s.dir < 0) u = 1.5 - u;
      u -= 0.25;
      const a0 = Math.max(lo, Math.round((u - s.dl) * SAMPLES));
      const a1 = Math.min(hi, Math.round(u * SAMPLES));
      if (a1 - a0 >= 2) {
        ctx.lineWidth = s.w * DPR * 1.5;
        ctx.strokeStyle = `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 50)},255,${Math.min(0.9, s.a * 3.4 * lum).toFixed(3)})`;
        strokeRange(a0, a1);
      }
    }

    // Hot spot at the pinch
    const hx = sx[pinchI], hy = sy[pinchI];
    const glow = cur.glow * introE * (1 + boost * 0.6);
    if (glow > 0.01) {
      const R = Math.min(W, H) * DPR * 0.22;
      let g = ctx.createRadialGradient(hx, hy, 0, hx, hy, R);
      g.addColorStop(0, `rgba(120,170,255,${(0.32 * glow).toFixed(3)})`);
      g.addColorStop(0.35, `rgba(40,105,235,${(0.12 * glow).toFixed(3)})`);
      g.addColorStop(1, "rgba(11,83,191,0)");
      ctx.fillStyle = g;
      ctx.fillRect(hx - R, hy - R, R * 2, R * 2);
      const r2 = R * 0.16;
      g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r2);
      g.addColorStop(0, `rgba(255,255,255,${(0.75 * glow).toFixed(3)})`);
      g.addColorStop(1, "rgba(200,225,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(hx - r2, hy - r2, r2 * 2, r2 * 2);
    }

    // Bloom: downscaled copy of the sharp frame + aurora haze
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = "source-over";
    bctx.clearRect(0, 0, bloom.width, bloom.height);
    bctx.globalAlpha = 0.9;
    bctx.drawImage(canvas, 0, 0, bloom.width, bloom.height);
    bctx.globalAlpha = 1;
    const aur = cur.aur * introE;
    if (aur > 0.01) {
      const k = 1 / (BLOOM_SCALE * DPR);
      bctx.globalCompositeOperation = "lighter";
      bctx.lineCap = "round";
      for (let j = 0; j < 7; j++) {
        const o = (j / 6) * 2 - 1;
        bctx.beginPath();
        for (let i = 0; i <= SAMPLES; i += 2) {
          const t = i / SAMPLES;
          const off = spread[i] * (o * 1.4 + Math.sin(t * 3 + time * 0.18 + j) * 0.35);
          const x = (sx[i] + nx[i] * off) * k, y = (sy[i] + ny[i] * off) * k;
          i === 0 ? bctx.moveTo(x, y) : bctx.lineTo(x, y);
        }
        bctx.lineWidth = Math.max(2, (spread[Math.round(SAMPLES * 0.2)] * k) * 0.55);
        bctx.strokeStyle = j % 3 === 0 ? `rgba(95,205,255,${(0.05 * aur).toFixed(3)})` : `rgba(30,100,240,${(0.075 * aur).toFixed(3)})`;
        bctx.stroke();
      }
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (intro < 1) intro = Math.min(1, intro + dt / 1.8);
    updateTarget();
    ease(dt, false);
    draw();
    raf = requestAnimationFrame(frame);
  }

  // Reduced motion: still, redrawn only when scroll or size changes.
  function still() {
    raf = 0;
    if (!dirty) return;
    dirty = false;
    updateTarget();
    ease(0, true);
    draw();
  }

  let raf = 0;
  function start() {
    cancelAnimationFrame(raf);
    if (reduceMQ.matches) {
      intro = 1;
      dirty = true;
      raf = requestAnimationFrame(still);
    } else {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  window.addEventListener("resize", () => {
    resize();
    if (reduceMQ.matches) start();
  });
  window.addEventListener(
    "scroll",
    () => {
      if (reduceMQ.matches && !raf) {
        dirty = true;
        raf = requestAnimationFrame(still);
      }
    },
    { passive: true },
  );
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      pointerX = e.clientX / W;
      pointerY = e.clientY / H;
    },
    { passive: true },
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else start();
  });
  reduceMQ.addEventListener?.("change", start);

  window.PlinthsRibbon = {
    /** Brief flare, e.g. while a primary CTA is hovered. */
    boost(on) {
      boostTarget = on ? 1 : 0;
    },
  };

  resize();
  updateTarget();
  ease(0, true);
  start();
})();
