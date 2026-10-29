"use client";

/**
 * A short, light confetti burst drawn on a throwaway canvas (no dependency, no assets).
 * It is only ever called from a deliberate moment (finishing onboarding, publishing a project, a milestone),
 * lasts about 1.6 seconds, removes itself, and does nothing when the member prefers reduced motion.
 */

const COLORS = ["#FF5A36", "#FFC83D", "#1FB89A", "#6AA7FF", "#F4EEE3", "#1B1812"];

/** `cone` ({ angle, width } in radians, angle -PI/2 = straight up) shoots the pieces in one direction like a party popper; without it they burst outward. */
export function fireConfetti({ x = 0.5, y = 0.35, count = 70, spread = 1, colors = COLORS, cone = null } = {}) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "200" });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.remove();
  ctx.scale(dpr, dpr);

  const originX = window.innerWidth * x;
  const originY = window.innerHeight * y;
  const pieces = Array.from({ length: count }, (_, i) => {
    const angle = cone ? cone.angle + (Math.random() - 0.5) * cone.width : (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const speed = (4 + Math.random() * 7) * spread;
    return {
      x: originX, y: originY,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (cone ? 0 : 5),
      w: 6 + Math.random() * 6, h: 3 + Math.random() * 5,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      color: colors[i % colors.length], round: i % 5 === 0,
    };
  });

  const start = performance.now();
  const duration = 1600;
  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const fade = Math.max(0, 1 - Math.max(0, t - 900) / (duration - 900));
    for (const p of pieces) {
      p.vy += 0.28; // gravity
      p.vx *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.h, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < duration) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

/** Two party poppers going off at the lower corners of the screen, aimed at the middle. */
export function firePartyPopper({ colors = COLORS } = {}) {
  fireConfetti({ x: 0.06, y: 0.96, count: 55, spread: 2.1, colors, cone: { angle: -Math.PI / 2 + 0.55, width: 0.7 } });
  setTimeout(() => fireConfetti({ x: 0.94, y: 0.96, count: 55, spread: 2.1, colors, cone: { angle: -Math.PI / 2 - 0.55, width: 0.7 } }), 140);
}
