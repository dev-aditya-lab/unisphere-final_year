import Image from "next/image";

/**
 * The hero's planet slot: the Orbits planet as a still picture that floats gently, with room for the 3D scene to draw into on a capable
 * desktop (landing-fx.jsx starts it and then adds `is-3d`, which fades this picture out and the canvas in). So the planet is always
 * there: server-rendered, on a phone, with reduced motion, with no WebGL, and while the 3D scene is still loading. It is decoration.
 */
export function HeroPlanet() {
  return (
    <div data-hero-3d aria-hidden="true" className="hero-3d">
      <div className="hero-planet">
        <Image data-hero-planet src="/icons/reward/orbit.png" alt="" width={500} height={500} priority sizes="(min-width: 1024px) 34rem, 14rem" className="hero-planet-img" />
      </div>
    </div>
  );
}
