import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
  WebGLRenderer,
} from "three";

/**
 * The landing hero's 3D scene: the Orbits planet (public/icons/reward/orbit.png) wrapped in tilted rings, with moons and a four-point
 * star riding them, a star field behind and soft light specks in front.
 *
 * It is real depth, not a flat picture with decoration: the planet is a picture drawn as a camera-facing sprite that writes depth, so
 * the half of each ring that passes behind it is hidden by it and the half that passes in front is drawn over it. The whole system
 * leans toward the pointer, breathes on its own, flies toward the camera as the page scrolls, and eases in when it starts.
 *
 * Nothing here is required: the page ships a still planet picture in the same place, which this fades out once the first frame is on
 * screen, and which stays if WebGL is missing, the device is weak, or motion is reduced. It draws only while it is on screen and the
 * tab is visible, and `destroy()` disposes everything it made.
 */

const BLUE = 0x2f63f0;
const SKY = 0x7aa0ff;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 4);

function radialTexture(stops) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([at, color]) => gradient.addColorStop(at, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function sparkleTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(c, 4);
  ctx.quadraticCurveTo(c + 6, c - 6, size - 4, c);
  ctx.quadraticCurveTo(c + 6, c + 6, c, size - 4);
  ctx.quadraticCurveTo(c - 6, c + 6, 4, c);
  ctx.quadraticCurveTo(c - 6, c - 6, c, 4);
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// Resolution steps (a cap on the device pixel ratio) the governor walks down, and when it does.
const RATIOS = [1.75, 1.25, 1, 0.75, 0.6];
const effectiveRatio = (cap) => Math.min(window.devicePixelRatio || 1, cap);
const WARM_UP_FRAMES = 45;
const RESIZE_WARM_UP_FRAMES = 20;
const WINDOW_FRAMES = 45;
const SLOW_FRAME_MS = 26; // about 38 frames a second
const GIVE_UP_FRAME_MS = 45; // about 22 frames a second at the lowest resolution

/**
 * @param {{ container: HTMLElement, image: HTMLImageElement, delay?: number, onReady?: () => void, onGiveUp?: () => void }} options
 *   `image` is the already loaded planet picture (so no second download); `delay` holds the entrance back, in seconds, while a loading
 *   screen is still on top. `onGiveUp` is called when the device cannot keep the scene smooth even at the lowest resolution (the
 *   caller then tears the scene down and the still planet stays).
 * @returns {{ destroy: () => void } | null} null when WebGL could not start.
 */
export function startHeroScene({ container, image, delay = 0, onReady, onGiveUp }) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const disposables = [];
  const keep = (thing) => {
    disposables.push(thing);
    return thing;
  };

  // The whole system is built in planet radii (the planet is 1 unit across its radius) and scaled to the hero in resize().
  const system = new Group();
  scene.add(system);

  // ── the planet ────────────────────────────────────────────────────────────────
  const planetTexture = keep(new Texture(image));
  planetTexture.colorSpace = SRGBColorSpace;
  planetTexture.needsUpdate = true;
  const planet = new Sprite(
    keep(new SpriteMaterial({ map: planetTexture, transparent: true, alphaTest: 0.5, alphaToCoverage: true, depthWrite: true })),
  );
  planet.scale.set(2.65, 2.65, 1); // the artwork has a margin; this makes the planet's body two units wide
  planet.renderOrder = 1;
  system.add(planet);

  // the artwork's own violet halo (the sprite above cuts it away to write depth), put back behind it, plus a wide blue glow
  const halo = new Sprite(keep(new SpriteMaterial({ map: planetTexture, transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending })));
  halo.scale.set(2.95, 2.95, 1);
  halo.position.z = -0.02;
  halo.renderOrder = 0;
  system.add(halo);
  const glowTexture = keep(radialTexture([[0, "rgba(120,160,255,0.85)"], [0.3, "rgba(47,99,240,0.4)"], [1, "rgba(47,99,240,0)"]]));
  const glow = new Sprite(keep(new SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.7 })));
  glow.scale.set(7.4, 7.4, 1);
  glow.position.z = -0.4;
  glow.renderOrder = 0;
  system.add(glow);

  // ── rings, moons and the sparkle ──────────────────────────────────────────────
  const sparkle = keep(sparkleTexture());
  const speck = keep(radialTexture([[0, "rgba(255,255,255,1)"], [0.4, "rgba(160,190,255,0.55)"], [1, "rgba(120,160,255,0)"]]));
  const rings = [
    { radius: 1.75, tube: 0.011, color: 0xffffff, opacity: 0.95, tilt: 1.22, roll: 0.32, speed: 0.34, moon: { size: 0.1, at: 0.2, color: 0xffffff } },
    { radius: 2.25, tube: 0.008, color: SKY, opacity: 0.8, tilt: 1.12, roll: -0.46, speed: -0.24, moon: { size: 0.075, at: 2.4, color: SKY }, star: 4.4 },
    { radius: 2.85, tube: 0.007, color: BLUE, opacity: 0.95, tilt: 1.3, roll: 0.78, speed: 0.17, moon: { size: 0.12, at: 4.1, color: 0xffffff } },
  ].map((spec) => {
    const tilt = new Group();
    tilt.rotation.set(spec.tilt, 0, spec.roll);
    system.add(tilt);
    const spin = new Group();
    tilt.add(spin);

    const line = new Mesh(keep(new TorusGeometry(spec.radius, spec.tube, 10, 240)), keep(new MeshBasicMaterial({ color: spec.color, transparent: true, opacity: spec.opacity, depthWrite: false })));
    line.renderOrder = 2;
    const bloom = new Mesh(keep(new TorusGeometry(spec.radius, spec.tube * 5, 8, 160)), keep(new MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.1, depthWrite: false, blending: AdditiveBlending })));
    bloom.renderOrder = 2;
    spin.add(line, bloom);

    const moon = new Mesh(keep(new SphereGeometry(spec.moon.size, 24, 16)), keep(new MeshBasicMaterial({ color: spec.moon.color })));
    moon.position.set(Math.cos(spec.moon.at) * spec.radius, Math.sin(spec.moon.at) * spec.radius, 0);
    moon.renderOrder = 3;
    const moonGlow = new Sprite(keep(new SpriteMaterial({ map: speck, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.9 })));
    moonGlow.scale.set(spec.moon.size * 7, spec.moon.size * 7, 1);
    moon.add(moonGlow);
    spin.add(moon);

    if (spec.star) {
      const star = new Sprite(keep(new SpriteMaterial({ map: sparkle, transparent: true, depthWrite: false, blending: AdditiveBlending })));
      star.scale.set(0.42, 0.42, 1);
      star.position.set(Math.cos(spec.star) * spec.radius, Math.sin(spec.star) * spec.radius, 0);
      star.renderOrder = 3;
      spin.add(star);
      spec.starSprite = star;
    }
    return { tilt, spin, spec };
  });

  // ── a star field behind, light specks in front ───────────────────────────────
  const starCount = 420;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 34;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 18;
    starPositions[i * 3 + 2] = -5 - Math.random() * 12;
  }
  const starGeometry = keep(new BufferGeometry());
  starGeometry.setAttribute("position", new Float32BufferAttribute(starPositions, 3));
  const stars = new Points(starGeometry, keep(new PointsMaterial({ color: 0xcfdcff, size: 0.05, transparent: true, opacity: 0.85, depthWrite: false })));
  scene.add(stars);

  const specks = [
    [-3.4, 1.9, 2.4, 0.55], [3.8, -1.7, 2.9, 0.7], [-1.2, -2.6, 3.4, 0.42], [2.2, 2.6, 1.9, 0.38], [-4.4, -0.6, 1.6, 0.5], [5.2, 1.1, 2.2, 0.34],
  ].map(([x, y, z, size]) => {
    const sprite = new Sprite(keep(new SpriteMaterial({ map: speck, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.32 })));
    sprite.scale.set(size, size, 1);
    sprite.position.set(x, y, z);
    sprite.userData.base = [x, y, z];
    scene.add(sprite);
    return sprite;
  });

  // ── layout: the planet sits right of centre, about 62% as tall as the hero ──────
  let ratioIndex = 0;
  let unit = 1;
  let anchorX = 0.74;
  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(effectiveRatio(RATIOS[ratioIndex]));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const viewHeight = 2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const viewWidth = viewHeight * camera.aspect;
    unit = viewHeight * 0.3;
    anchorX = width < 1100 ? 0.72 : 0.76;
    system.position.x = viewWidth * (anchorX - 0.5);
  };
  resize();

  // ── input ─────────────────────────────────────────────────────────────────────
  let targetX = 0;
  let targetY = 0;
  let pointerX = 0;
  let pointerY = 0;
  const onPointer = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    targetX = (event.clientX / window.innerWidth) * 2 - 1;
    targetY = (event.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  // ── the loop ──────────────────────────────────────────────────────────────────
  let raf = 0;
  let running = false;
  let onScreen = true;
  let last = performance.now();
  let time = 0;
  let announced = false;

  // Frame-time governor: the scene is decoration, so a device that cannot draw it smoothly gets it sharper-less, and one that still cannot
  // gets the still planet instead (never a stuttering page). It judges runs of frames after a warm-up (shader compile, texture upload),
  // and only frames that were really drawn: the loop pauses off screen and in hidden tabs, and the clock restarts on resume.
  let warmUp = WARM_UP_FRAMES;
  let windowFrames = 0;
  let windowTime = 0;
  let gaveUp = false;
  const stepDown = () => {
    const current = effectiveRatio(RATIOS[ratioIndex]);
    let next = ratioIndex + 1;
    while (next < RATIOS.length && effectiveRatio(RATIOS[next]) >= current) next++;
    if (next >= RATIOS.length) return false;
    ratioIndex = next;
    resize();
    return true;
  };
  const govern = (elapsed) => {
    if (gaveUp) return;
    if (warmUp > 0) {
      warmUp--;
      return;
    }
    windowFrames++;
    windowTime += Math.min(elapsed, 120);
    if (windowFrames < WINDOW_FRAMES) return;
    const average = windowTime / windowFrames;
    windowFrames = 0;
    windowTime = 0;
    if (average <= SLOW_FRAME_MS) return;
    if (stepDown()) {
      warmUp = RESIZE_WARM_UP_FRAMES;
    } else if (average > GIVE_UP_FRAME_MS) {
      gaveUp = true;
      onGiveUp?.();
    }
  };

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    govern(now - last);
    if (gaveUp) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;

    pointerX += (targetX - pointerX) * Math.min(1, dt * 3.2);
    pointerY += (targetY - pointerY) * Math.min(1, dt * 3.2);

    const rect = container.getBoundingClientRect();
    const progress = clamp(-rect.top / Math.max(1, rect.height), 0, 1.4);
    const entrance = easeOut((time - delay) / 2.1);

    // the system leans toward the pointer, breathes, and flies toward the camera as the page scrolls past
    system.rotation.y = pointerX * 0.42 + Math.sin(time * 0.35) * 0.05;
    system.rotation.x = -pointerY * 0.24 + progress * 0.5;
    system.position.y = -progress * unit * 1.2;
    system.scale.setScalar(unit * (0.5 + 0.5 * entrance) * (1 + progress * 1.1));
    system.rotation.z = (1 - entrance) * -0.6 + progress * 0.15;
    planet.position.x = -pointerX * 0.1;
    planet.position.y = -pointerY * 0.08 + Math.sin(time * 0.8) * 0.04;
    planet.material.rotation = Math.sin(time * 0.3) * 0.06 + (1 - entrance) * 0.9;
    halo.position.x = planet.position.x;
    halo.position.y = planet.position.y;
    glow.material.opacity = (0.5 + Math.sin(time * 1.4) * 0.12) * entrance;

    rings.forEach(({ tilt, spin, spec }, i) => {
      spin.rotation.z += dt * spec.speed;
      tilt.rotation.x = spec.tilt + Math.sin(time * 0.45 + i * 1.7) * 0.035 - pointerY * 0.06;
      if (spec.starSprite) spec.starSprite.material.rotation = time * 1.2;
    });
    stars.rotation.y = time * 0.012 + pointerX * 0.12;
    stars.position.x = -pointerX * 0.5;
    stars.position.y = pointerY * 0.3;
    specks.forEach((sprite, i) => {
      const [x, y, z] = sprite.userData.base;
      sprite.position.set(x - pointerX * z * 0.35, y + pointerY * z * 0.25 + Math.sin(time * 0.6 + i) * 0.12, z);
    });

    canvas.style.opacity = String(1 - clamp((progress - 0.55) / 0.5));
    renderer.render(scene, camera);

    if (!announced) {
      announced = true;
      onReady?.();
    }
  };

  const sync = () => {
    const should = onScreen && !document.hidden;
    if (should && !running) {
      running = true;
      last = performance.now();
      warmUp = Math.max(warmUp, RESIZE_WARM_UP_FRAMES);
      raf = requestAnimationFrame(frame);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  };
  const observer = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  });
  observer.observe(container);
  document.addEventListener("visibilitychange", sync);
  const resizer = new ResizeObserver(resize);
  resizer.observe(container);
  sync();

  return {
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      resizer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pointermove", onPointer);
      disposables.forEach((thing) => thing.dispose?.());
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
}
