/*
 * Plinths homepage interactions.
 * Works without GSAP (content, feature switching and the live commit hash need none of it); GSAP + ScrollTrigger
 * add the intro, scroll-linked storytelling and magnetic buttons. prefers-reduced-motion skips all of that.
 */
(function () {
  "use strict";

  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const motion = !!(gsap && ScrollTrigger) && !reduce;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  /* ───────── Navigation ───────── */

  const nav = $("#nav");
  const onScrollNav = () => nav.classList.toggle("is-scrolled", window.scrollY > 10);
  window.addEventListener("scroll", onScrollNav, { passive: true });
  onScrollNav();

  const toggle = $(".nav__toggle");
  const mnav = $("#mnav");
  const setMenu = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    mnav.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
  };
  toggle.addEventListener("click", () => setMenu(mnav.hidden));
  mnav.addEventListener("click", (e) => e.target.closest("a") && setMenu(false));
  document.addEventListener("keydown", (e) => e.key === "Escape" && !mnav.hidden && (setMenu(false), toggle.focus()));
  window.addEventListener("resize", () => window.innerWidth > 860 && !mnav.hidden && setMenu(false));

  /* ───────── Commit preview: the real commitment, computed live ───────── */

  const H = window.PlinthsHash;
  const BIDDER = "0x7a1c3e9f20b4d5a6c8e0f1a2b3c4d5e6f7a8b9c0";
  const amountEl = $("#commit-amount");
  const hashEl = $("#commit-hash");
  const short = (hex) => hex.slice(0, 8) + "…" + hex.slice(-6);
  let salt = "", docKey = "";

  function newSecrets() {
    salt = H.randomHex32();
    docKey = H.randomHex32();
    $("#commit-salt").textContent = short(salt);
    $("#commit-dockey").textContent = short(H.toHex(H.keccak256(H.hexToBytes(docKey))));
  }
  function updateCommit() {
    const amount18 = H.parseUnits18(amountEl.value);
    amountEl.setAttribute("aria-invalid", String(amount18 === null));
    hashEl.textContent = amount18 === null ? "enter a price, e.g. 8.25" : H.commitment({ tenderId: 0, bidder: BIDDER, amount18, salt, docKey });
    hashEl.classList.remove("flash");
    void hashEl.offsetWidth;
    hashEl.classList.add("flash");
  }
  if (H && amountEl) {
    newSecrets();
    updateCommit();
    amountEl.addEventListener("input", updateCommit);
    $("#commit-resalt").addEventListener("click", () => {
      newSecrets();
      updateCommit();
    });
  }

  /* ───────── Encrypt preview ───────── */

  const B32 = "abcdefghijklmnopqrstuvwxyz234567";
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const rand = (alphabet, n) => Array.from({ length: n }, () => alphabet[(Math.random() * alphabet.length) | 0]).join("");
  let encRaf = 0;
  function runEncrypt() {
    cancelAnimationFrame(encRaf);
    const bar = $("#enc-bar"), pct = $("#enc-pct"), cipher = $("#enc-cipher"), cid = $("#enc-cid");
    const finish = () => {
      bar.style.width = "100%";
      pct.textContent = "100%";
      cipher.textContent = rand(B64, 120);
      cid.textContent = "ipfs://bafybei" + rand(B32, 6) + "…";
    };
    if (reduce) return finish();
    cid.textContent = "encrypting…";
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 1500);
      const e = 1 - Math.pow(1 - p, 3);
      bar.style.width = (e * 100).toFixed(1) + "%";
      pct.textContent = Math.round(e * 100) + "%";
      cipher.textContent = rand(B64, Math.round(12 + e * 108));
      if (p < 1) encRaf = requestAnimationFrame(step);
      else finish();
    };
    encRaf = requestAnimationFrame(step);
  }
  $("#enc-replay")?.addEventListener("click", runEncrypt);

  function runPhaseClock() {
    const now = $("#phase-now");
    if (!now) return;
    now.style.transition = "none";
    now.style.left = "8%";
    void now.offsetWidth;
    now.style.transition = reduce ? "none" : "left 1.8s cubic-bezier(.22,1,.36,1) .2s";
    now.style.left = "58%";
  }

  /* ───────── Feature showcase: the feature nearest the reading line drives the preview ───────── */

  const features = $$("[data-feature]");
  const previews = $$("[data-preview]");
  const stage = $(".features__stage");
  const PATHS = ["plinths / tenders / 0 / bid", "plinths / tenders / 0 / proposal", "plinths / tenders / 0 / phases", "plinths / agent / tender 0", "plinths / nft / 2"];
  let activeFeature = -1;

  function setFeature(i) {
    if (i === activeFeature) return;
    activeFeature = i;
    features.forEach((f, j) => f.classList.toggle("is-active", j === i));
    previews.forEach((p, j) => p.classList.toggle("is-active", j === i));
    $("#stage-path").textContent = PATHS[i];
    $("#stage-progress").style.width = ((i + 1) / features.length) * 100 + "%";
    if (i === 1) runEncrypt();
    if (i === 2) runPhaseClock();
  }

  function readingLine() {
    // On phones the preview is sticky at the top, so read in the space below it.
    if (window.innerWidth <= 860 && stage) {
      const b = stage.getBoundingClientRect().bottom;
      return b + (window.innerHeight - b) * 0.4;
    }
    return window.innerHeight * 0.5;
  }

  let featTick = false;
  function updateFeature() {
    featTick = false;
    const line = readingLine();
    let best = 0, bestD = Infinity;
    features.forEach((f, i) => {
      const r = f.getBoundingClientRect();
      const d = Math.abs((window.innerWidth <= 860 ? r.top + 120 : r.top + r.height / 2) - line);
      if (d < bestD) (bestD = d), (best = i);
    });
    setFeature(best);
  }
  window.addEventListener("scroll", () => !featTick && (featTick = true) && requestAnimationFrame(updateFeature), { passive: true });
  window.addEventListener("resize", updateFeature);
  updateFeature();

  features.forEach((f) =>
    f.addEventListener("click", (e) => {
      if (e.target.closest("a, button, input")) return;
      const r = f.getBoundingClientRect();
      const offset = window.innerWidth <= 860 ? readingLine() - 120 : window.innerHeight / 2 - r.height / 2;
      window.scrollTo({ top: window.scrollY + r.top - offset, behavior: reduce ? "auto" : "smooth" });
    }),
  );

  /* ───────── Ribbon flare on primary CTAs ───────── */

  $$("[data-boost]").forEach((el) => {
    const on = () => window.PlinthsRibbon?.boost(true);
    const off = () => window.PlinthsRibbon?.boost(false);
    el.addEventListener("pointerenter", on);
    el.addEventListener("pointerleave", off);
    el.addEventListener("focus", on);
    el.addEventListener("blur", off);
  });

  /* ───────── Cards: light follows the pointer ───────── */

  if (finePointer) {
    $$("[data-glow]").forEach((el) =>
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--gx", e.clientX - r.left + "px");
        el.style.setProperty("--gy", e.clientY - r.top + "px");
      }),
    );
  }

  $$(".stat__blocks i").forEach((b, i) => b.style.setProperty("--i", i));

  // Groups whose bars, rings and counters fill in once they are on screen
  const litGroups = $$(".trust__grid, .desk__grid, .numbers__row");

  /* ───────── Without motion: show final states and stop here ───────── */

  if (!motion) {
    root.classList.add("ready");
    $$("[data-step]").forEach((s) => s.classList.add("is-lit"));
    litGroups.forEach((g) => g.classList.add("is-in"));
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: "expo.out" });
  root.classList.add("has-motion"); // turns on the pinned brand panel

  /* ───────── Intro mask: the logo tile floods the screen, then opens onto the hero (once per session) ───────── */

  let heroDelay = 0.15;
  let seen = false;
  try {
    seen = sessionStorage.getItem("plinths-intro") === "1";
    sessionStorage.setItem("plinths-intro", "1");
  } catch {
    /* storage blocked: play it */
  }
  if (!seen && window.scrollY < 40) {
    const mask = document.createElement("div");
    mask.className = "intro";
    mask.setAttribute("aria-hidden", "true");
    mask.innerHTML =
      '<div class="intro__bg"></div><div class="intro__fill"></div>' +
      '<span class="intro__tile"><img src="/home/assets/img/plinths-mark.png" alt="" width="36" height="36" /></span>';
    document.body.appendChild(mask);
    const fill = $(".intro__fill", mask);
    const tile = $(".intro__tile", mask);
    const w = window.innerWidth / 2, h = window.innerHeight / 2;
    // Two-value px insets throughout: browsers normalise symmetric insets to this form, and GSAP needs the
    // start and end strings to line up number for number.
    gsap.set(fill, { clipPath: `inset(${h - 32}px ${w - 32}px round 18px)` });
    gsap
      .timeline({ onComplete: () => mask.remove() })
      .from(tile, { scale: 0.4, opacity: 0, duration: 0.5, ease: "back.out(1.6)" })
      .from(fill, { opacity: 0, duration: 0.3 }, 0.1)
      .to(fill, { clipPath: "inset(0px 0px round 0px)", duration: 0.65, ease: "expo.inOut" }, 0.45)
      .set($(".intro__bg", mask), { opacity: 0 })
      .to(fill, { clipPath: `inset(${h * 0.32}px ${w * 0.44}px round 56px)`, duration: 0.45, ease: "power3.out" })
      .to(fill, { clipPath: `inset(${h}px ${w}px round 56px)`, duration: 0.5, ease: "expo.in" })
      .to(tile, { scale: 0.6, opacity: 0, duration: 0.35, ease: "power2.in" }, "<0.15");
    heroDelay = 1.3;
  }

  /* ───────── Intro ───────── */

  const dash = $("#hero-dash");
  const introEls = $$("[data-intro]");
  const lines = $$("[data-intro-line]");
  const nodes = $$("[data-node]");
  const solidEdges = $$(".graph .edge:not(.edge--dim)");
  const dimEdges = $$(".graph .edge--dim");
  const floatA = $("[data-intro-float]");

  gsap.set(introEls, { opacity: 0, y: 18 });
  gsap.set(lines, { y: 0, yPercent: 112 }); // y: 0 drops the CSS pre-hide translate GSAP would otherwise keep
  gsap.set(dash, { opacity: 0, rotationY: -26, rotationX: 14, y: 90, z: -160 });
  gsap.set(floatA, { opacity: 0, y: 30 });
  gsap.set(nodes, { opacity: 0, y: 10, scale: 0.96 });
  gsap.set(dimEdges, { opacity: 0 });
  solidEdges.forEach((p) => {
    const len = p.getTotalLength() + 2;
    gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
  });
  root.classList.add("ready");

  const intro = gsap.timeline({ delay: heroDelay });
  intro
    .to(introEls[0], { opacity: 1, y: 0, duration: 1 })
    .to(lines, { yPercent: 0, duration: 1.3, stagger: 0.12 }, 0.1)
    .to(introEls.slice(1), { opacity: 1, y: 0, duration: 1.1, stagger: 0.09 }, 0.45)
    .to(dash, { opacity: 1, rotationY: -11, rotationX: 5, y: 0, z: 0, duration: 1.8, ease: "expo.out" }, 0.3)
    .to(nodes, { opacity: 1, y: 0, scale: 1, duration: 0.8, stagger: 0.1 }, 0.95)
    .to(solidEdges, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut", stagger: 0.25 }, 1.15)
    .to(dimEdges, { opacity: 1, duration: 0.8 }, 1.3)
    .to(floatA, { opacity: 1, y: 0, duration: 1 }, 1.5)
    .add(heroScroll);

  /* ───────── Hero → next section ───────── */

  function heroScroll() {
    // Copy lifts away at full brightness; the dashboard flattens, grows slightly and rises as you scroll out of the hero.
    gsap
      .timeline({ scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.9 } })
      .to(".hero__copy", { y: -150, ease: "none" }, 0)
      .to(dash, { rotationY: 0, rotationX: 0, ease: "none" }, 0)
      .to(".hero__stage", { y: -70, scale: 1.05, ease: "none" }, 0)
      .to(floatA, { y: -60, opacity: 0, ease: "none" }, 0);
    ScrollTrigger.refresh();
  }

  // Pointer tilt on the hero dashboard (desktop only)
  if (finePointer) {
    const tilt = $(".hero__tilt");
    const rx = gsap.quickTo(tilt, "rotationX", { duration: 0.9, ease: "power3.out" });
    const ry = gsap.quickTo(tilt, "rotationY", { duration: 0.9, ease: "power3.out" });
    $(".hero").addEventListener("pointermove", (e) => {
      ry(((e.clientX / window.innerWidth) - 0.5) * 7);
      rx(-((e.clientY / window.innerHeight) - 0.5) * 5);
    });
    $(".hero").addEventListener("pointerleave", () => (rx(0), ry(0)));
  }

  /* ───────── Statement: words light up as you read ───────── */

  const statement = $("[data-words]");
  if (statement) {
    const words = statement.textContent.trim().split(/\s+/);
    statement.innerHTML = words.map((w) => `<span class="w">${w} </span>`).join("");
    gsap.fromTo(
      $$(".w", statement),
      { opacity: 0.13 },
      { opacity: 1, ease: "none", stagger: 0.06, scrollTrigger: { trigger: statement, start: "top 78%", end: "bottom 42%", scrub: 0.6 } },
    );
  }

  /* ───────── Generic reveals ───────── */

  $$("[data-reveal]").forEach((el) =>
    gsap.from(el, { y: 44, opacity: 0, duration: 1.2, scrollTrigger: { trigger: el, start: "top 88%", once: true } }),
  );
  $$("[data-reveal-group]").forEach((group) =>
    gsap.from(group.children, {
      y: 30,
      opacity: 0,
      duration: 1,
      stagger: 0.07,
      scrollTrigger: { trigger: group, start: "top 88%", once: true },
    }),
  );

  // Feature copy drifts in as each item reaches the reading line
  features.forEach((f) =>
    gsap.from(f.children, { y: 26, opacity: 0, duration: 1, stagger: 0.06, scrollTrigger: { trigger: f, start: "top 80%", once: true } }),
  );
  gsap.from(".features__stage .stage", {
    y: 60,
    opacity: 0,
    rotationX: 10,
    transformPerspective: 1400,
    duration: 1.4,
    scrollTrigger: { trigger: ".features__grid", start: "top 80%", once: true },
  });

  /* ───────── Product: the results screen tilts up into place ───────── */

  gsap.fromTo(
    "#product-screen",
    { rotationX: 34, y: 80, scale: 0.88, opacity: 0.35 },
    {
      rotationX: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      ease: "none",
      scrollTrigger: { trigger: ".product__scene", start: "top 98%", end: "top 28%", scrub: 0.9 },
    },
  );
  gsap.from(".iso__bar i", {
    scaleY: 0,
    duration: 1.4,
    stagger: 0.08,
    scrollTrigger: { trigger: ".iso", start: "top 82%", once: true },
  });
  gsap.from(".res__table li", {
    x: 16,
    opacity: 0,
    duration: 0.9,
    stagger: 0.06,
    scrollTrigger: { trigger: ".res__table", start: "top 85%", once: true },
  });

  const mm = gsap.matchMedia();
  mm.add("(min-width: 861px)", () => {
    $$("[data-speed]").forEach((el) => {
      const s = parseFloat(el.dataset.speed) || 0.3;
      gsap.fromTo(
        el,
        { y: 160 * s },
        { y: -160 * s, ease: "none", scrollTrigger: { trigger: ".product__scene", start: "top bottom", end: "bottom top", scrub: true } },
      );
    });

    // How it works: the trail draws across the row and lights each step as it passes
    const trail = $("#how-trail");
    const steps = $$("[data-step]");
    const len = trail.getTotalLength();
    gsap.set(trail, { strokeDasharray: len, strokeDashoffset: len });
    gsap.to(trail, {
      strokeDashoffset: 0,
      ease: "none",
      scrollTrigger: {
        trigger: ".how__row",
        start: "top 78%",
        end: "bottom 55%",
        scrub: 0.6,
        onUpdate: (self) => steps.forEach((st, i) => st.classList.toggle("is-lit", self.progress >= i / steps.length + 0.06)),
      },
    });
  });
  mm.add("(max-width: 860px)", () => {
    $$("[data-step]").forEach((st) =>
      ScrollTrigger.create({ trigger: st, start: "top 72%", toggleClass: { targets: st, className: "is-lit" } }),
    );
  });

  gsap.from("[data-step]", {
    y: 50,
    opacity: 0,
    duration: 1.1,
    stagger: 0.1,
    scrollTrigger: { trigger: ".how__steps", start: "top 85%", once: true },
  });

  /* ───────── Brand panel: opens from a card to full bleed, then the words light up while it is pinned ───────── */

  const sealPanel = $("#seal-panel");
  if (sealPanel) {
    gsap.fromTo(
      sealPanel,
      { clipPath: "inset(16% 20% round 44px)" },
      {
        clipPath: "inset(0% 0% round 28px)",
        ease: "none",
        scrollTrigger: { trigger: ".seal", start: "top 85%", end: "top top", scrub: 0.8 },
      },
    );
    gsap.from([".seal__kicker", ".seal__tile"], {
      y: 30,
      opacity: 0,
      ease: "none",
      scrollTrigger: { trigger: ".seal", start: "top 60%", end: "top 10%", scrub: 0.8 },
    });

    // Split into words but keep the <em>, so the serif accent survives
    const sealText = $("[data-seal-words]");
    const wrap = (txt) => txt.split(/(\s+)/).map((t) => (t.trim() ? `<span class="w">${t}</span>` : t)).join("");
    sealText.innerHTML = Array.from(sealText.childNodes)
      .map((n) => (n.nodeType === 3 ? wrap(n.textContent) : `<em>${wrap(n.textContent)}</em>`))
      .join("");
    gsap.fromTo(
      $$(".w", sealText),
      { opacity: 0.25 },
      { opacity: 1, ease: "none", stagger: 0.08, scrollTrigger: { trigger: ".seal", start: "top 20%", end: "bottom 90%", scrub: 0.6 } },
    );
  }

  /* ───────── Trust, desk, numbers: fill bars and count up once in view ───────── */

  litGroups.forEach((g) =>
    ScrollTrigger.create({
      trigger: g,
      start: "top 78%",
      once: true,
      onEnter: () => {
        g.classList.add("is-in");
        $$("[data-count]", g).forEach((el) => {
          const to = parseFloat(el.dataset.count);
          const n = { v: to === 0 ? 12 : 0 }; // zero counts down, so it reads as a result rather than a blank
          gsap.to(n, { v: to, duration: 1.8, ease: "power3.out", onUpdate: () => (el.textContent = Math.round(n.v)) });
        });
      },
    }),
  );

  /* ───────── CTA ───────── */

  gsap.from([".cta__card", ".cta__side"], {
    y: 70,
    opacity: 0,
    duration: 1.3,
    stagger: 0.12,
    scrollTrigger: { trigger: ".cta__grid", start: "top 85%", once: true },
  });
  gsap.from(".cta__card > *", {
    y: 24,
    opacity: 0,
    duration: 1,
    stagger: 0.08,
    delay: 0.25,
    scrollTrigger: { trigger: ".cta__grid", start: "top 85%", once: true },
  });
  gsap.from(".cta__status li", {
    opacity: 0,
    y: 10,
    duration: 0.9,
    stagger: 0.1,
    scrollTrigger: { trigger: ".cta__status", start: "top 95%", once: true },
  });

  /* ───────── Magnetic buttons ───────── */

  if (finePointer) {
    $$(".magnetic").forEach((el) => {
      const mx = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
      const my = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        mx((e.clientX - (r.left + r.width / 2)) * 0.22);
        my((e.clientY - (r.top + r.height / 2)) * 0.32);
      });
      el.addEventListener("pointerleave", () => gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: "elastic.out(1, 0.4)" }));
    });
  }

  window.addEventListener("load", () => ScrollTrigger.refresh());
})();
