import gsap from "gsap";
// The ES source, not the package entry: the entry also imports sheryjs's stylesheet, which sets a global
// `body { background-color: #fff }`. The few rules its effects need live in app/(marketing)/landing.css instead.
import * as Shery from "sheryjs/src/Effects.js";

/**
 * sheryjs for a React page.
 *
 * sheryjs is written for a plain page that is never torn down: it attaches listeners to `window` and `document` without a way
 * to remove them, appends elements to <body>, wraps the images it is given, and its WebGL image effect starts a render loop
 * that never ends and keeps one module-level renderer. Used as-is in a client-routed app, every visit to the landing page
 * would leave all of that running for the rest of the session. This module runs its effects and gives each one a real
 * teardown: it records the listeners the library adds so they can be removed, removes what it appended, puts wrapped images
 * back, stops its render loops, and pauses (not disposes: the library's renderer cannot be recreated) the shared canvas.
 *
 * Nothing here is needed for the page to work. Every feature is guarded, so one failing never affects the others or the page.
 */

const EMPTY_RECT = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() { return this; } };
const HERO_CLASS = "sh-hero";

/** Shared with the renderer wrapper below, so a render can be skipped without touching the library. */
const frame = { paused: true, visible: true, shown: false };

/**
 * Runs `run`, and returns a function that removes every `window`/`document` listener it added. A non-passive `touchstart`
 * handler (sheryjs adds one for its multi-image scrolling) is made passive: it does nothing, and a blocking one slows scrolling.
 */
function captureListeners(run) {
  const added = [];
  const patch = (target) => {
    const original = target.addEventListener;
    target.addEventListener = function (type, listener, options) {
      let effective = options;
      if (type === "touchstart" && (options === undefined || options === false || (typeof options === "object" && options.passive === false))) {
        effective = { ...(typeof options === "object" ? options : {}), passive: true };
      }
      added.push([target, type, listener, effective]);
      return original.call(this, type, listener, effective);
    };
    return () => {
      delete target.addEventListener;
    };
  };
  const restore = [patch(window), patch(document)];
  try {
    run();
  } finally {
    restore.forEach((fn) => fn());
  }
  return () => added.forEach(([target, type, listener, options]) => target.removeEventListener(type, listener, options));
}

/**
 * Runs `run` with `setTimeout` ignoring anything that is not a function. sheryjs's image effect calls
 * `setTimeout(window.dispatchEvent(new Event("resize")), 0)`, which hands `setTimeout` a boolean; the browser reads that as a
 * string of code to evaluate, and this site's strict Content-Security-Policy (no `unsafe-eval`) rightly refuses and logs an error.
 * The resize event is still dispatched, because that happens while the argument is worked out.
 */
function withoutStringTimers(run) {
  const original = window.setTimeout;
  window.setTimeout = function (handler, ...rest) {
    return typeof handler === "function" ? original.call(this, handler, ...rest) : 0;
  };
  try {
    run();
  } finally {
    window.setTimeout = original;
  }
}

let loopsStopping = false;
/** Makes the `requestAnimationFrame(animate)` that ends sheryjs's per-image loop a no-op for the rest of the current frame. */
function endCurrentLoop() {
  if (loopsStopping) return;
  loopsStopping = true;
  const original = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0;
  queueMicrotask(() => {
    window.requestAnimationFrame = original;
    loopsStopping = false;
  });
}

async function startImageEffect(img, cleanups, isStopped) {
  if (!img.complete || !img.naturalWidth) {
    await new Promise((resolve) => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    });
  }
  if (!img.naturalWidth || !img.isConnected || isStopped()) return;

  const realRect = img.getBoundingClientRect.bind(img);
  let dead = false;
  let lastRect = EMPTY_RECT;
  // The library reads this element's rectangle about ten times at the top of every frame. While the picture is off screen nothing
  // is drawn, so those layout reads are skipped and the last rectangle is handed back. Once the page is torn down, the first read
  // also ends the library's loop (see endCurrentLoop), and the zero rectangle keeps the rest of that last frame harmless.
  img.getBoundingClientRect = () => {
    if (dead) {
      endCurrentLoop();
      return EMPTY_RECT;
    }
    if (!frame.visible) return lastRect;
    lastRect = realRect();
    return lastRect;
  };

  let attributes = null;
  const release = captureListeners(() => withoutStringTimers(() => {
    Shery.imageEffect(`.${HERO_CLASS}`, {
      style: 1,
      // Hover-driven: the picture is still until the pointer is over it, then it ripples gently, and settles when it leaves.
      setUniforms: (uniforms) => {
        uniforms.onMouse.value = 1;
        uniforms.a.value = 1.1;
        uniforms.b.value = 0.42;
      },
      setAttribute: (attrs) => {
        attributes = attrs;
      },
    });
  }));
  // The library hides the original image the moment it starts, before its own copy is ready. Keep the original showing: the
  // effect's canvas sits above it and covers it exactly, so there is never a blank frame.
  img.style.opacity = "";

  if (!attributes) {
    release();
    delete img.getBoundingClientRect;
    return;
  }

  const { renderer, scene, meshes } = attributes;
  const container = renderer.domElement.parentElement;
  const uniforms = attributes.uniforms[0];

  // The canvas is only worth drawing while the effect is visibly doing something: the pointer is over the picture, or the ripple is
  // still settling. At rest the original image shows exactly the same thing, so the canvas is hidden and nothing is rendered: scrolling
  // past the hero then costs no WebGL at all. (The library keeps updating its uniforms every frame, so a hover is noticed at once.)
  if (!renderer.__landing) {
    const render = renderer.render.bind(renderer);
    renderer.render = (...args) => {
      if (frame.paused || !frame.visible) return;
      const box = containerRef.current;
      const active = (uniformsRef.current?.uIntercept?.value ?? 0) > 0.002;
      if (!active) {
        if (frame.shown && box) {
          frame.shown = false;
          box.dataset.state = "idle";
        }
        return;
      }
      render(...args); // draw first, then reveal, so the canvas is never shown empty
      if (!frame.shown && box) {
        frame.shown = true;
        box.dataset.state = "live";
      }
    };
    renderer.__landing = true;
  }
  uniformsRef.current = uniforms;
  containerRef.current = container;
  frame.shown = false;
  frame.paused = false;
  container.dataset.state = "idle";

  const observer = new IntersectionObserver(([entry]) => {
    frame.visible = entry.isIntersecting;
    if (!entry.isIntersecting) {
      frame.shown = false;
      container.dataset.state = "idle";
    }
  });
  observer.observe(img);

  cleanups.push(() => {
    dead = true;
    frame.paused = true;
    observer.disconnect();
    release();
    frame.shown = false;
    container.dataset.state = "paused";
    meshes.forEach((mesh) => {
      scene.remove(mesh);
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    });
    containerRef.current = null;
    uniformsRef.current = null;
    img.style.opacity = "";
    // The next frame (if the tab is visible) ends the loop; afterwards the element gets its own method back.
    setTimeout(() => {
      delete img.getBoundingClientRect;
    }, 250);
  });
}

// The wrapped renderer outlives one page visit, so what it reads is held here and swapped on each start.
const containerRef = { current: null };
const uniformsRef = { current: null };

/**
 * Starts the effects found under `root` and returns the function that undoes all of them.
 * `features.webgl` says whether the image effect may run (WebGL available).
 */
export function startShery({ root, features }) {
  const cleanups = [];
  let stopped = false;
  const guard = (name, run) => {
    try {
      run();
    } catch (error) {
      console.warn(`[landing] the ${name} effect is unavailable`, error);
    }
  };

  // Many sheryjs handlers tween ".mousefollower" even when it is not on the page; that is expected, so keep GSAP quiet about it.
  gsap.config({ nullTargetWarn: false });
  cleanups.push(() => gsap.config({ nullTargetWarn: true }));
  const context = gsap.context(() => {}, root);
  cleanups.push(() => context.revert());

  guard("cursor", () => {
    const release = captureListeners(() => Shery.mouseFollower({ duration: 0.9 }));
    cleanups.push(() => {
      release();
      document.querySelectorAll(".mousefollower").forEach((node) => node.remove());
    });
  });

  guard("magnet", () => {
    const targets = [...root.querySelectorAll(".sh-magnet")];
    if (!targets.length) return;
    Shery.makeMagnet(".sh-magnet", { duration: 1 });
    cleanups.push(() => targets.forEach((el) => { gsap.killTweensOf(el); gsap.set(el, { clearProps: "x,y" }); }));
  });

  guard("text", () => {
    const labels = [...root.querySelectorAll(".sh-text")];
    if (!labels.length) return;
    const original = labels.map((el) => el.innerHTML);
    context.add(() => Shery.textAnimate(".sh-text", { style: 1, y: 14, delay: 0.03, duration: 1.4 }));
    cleanups.push(() => labels.forEach((el, i) => { el.innerHTML = original[i]; el.classList.remove("sheryelem"); }));
  });

  guard("picture masks", () => {
    const pictures = [...root.querySelectorAll(".sh-mask")];
    if (!pictures.length) return;
    const placed = pictures.map((img) => ({ img, parent: img.parentNode }));
    Shery.imageMasker(".sh-mask", { mouseFollower: true, text: "View", duration: 1 });
    cleanups.push(() => placed.forEach(({ img, parent }) => {
      const mask = img.parentNode;
      if (mask && mask !== parent && mask.classList.contains("mask")) {
        parent.insertBefore(img, mask);
        mask.remove();
      }
    }));
  });

  guard("hover pictures", () => {
    const rows = [...root.querySelectorAll(".sh-hover")];
    const images = rows.map((row) => row.dataset.hoverImage).filter(Boolean);
    if (!rows.length || !images.length) return;
    images.forEach((src) => { new Image().src = src; });
    const before = new Set(document.body.children);
    Shery.hoverWithMediaCircle(".sh-hover", { images });
    // The library's floating picture has no alt text; it is decoration, so it is marked as such.
    document.querySelectorAll(".movercirc").forEach((node) => {
      node.setAttribute("aria-hidden", "true");
      node.querySelectorAll("img").forEach((img) => img.setAttribute("alt", ""));
    });
    cleanups.push(() => {
      [...document.body.children].forEach((node) => {
        if (!before.has(node) && node.classList.contains("movercirc")) node.remove();
      });
      rows.forEach((row) => row.classList.remove("hovercircle"));
    });
  });

  if (features.webgl) {
    const hero = root.querySelector(`.${HERO_CLASS}`);
    if (hero) {
      startImageEffect(hero, cleanups, () => stopped)
        .then(() => {
          // If the page went away while the picture was loading, the teardown has already run without this effect.
          if (stopped) cleanups.forEach((fn) => { try { fn(); } catch {} });
        })
        .catch((error) => console.warn("[landing] the image effect is unavailable", error));
    }
  }

  return () => {
    stopped = true;
    const run = cleanups.splice(0).reverse();
    run.forEach((fn) => {
      try {
        fn();
      } catch (error) {
        console.warn("[landing] cleanup", error);
      }
    });
  };
}
