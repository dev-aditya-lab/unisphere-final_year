// Generates the Android app's launcher icons, splash icon and notification icon from the real logo (public/unisphereLogo.png).
//   npm run native:icons
// Output (android/app/src/main/res): mipmap-*/ic_launcher{,_round,_foreground,_monochrome}.png, drawable-nodpi/splash_icon.png and
// drawable-*dpi/ic_stat_unisphere.png (the monochrome icon in the status bar next to a notification: Android uses only its alpha).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SOURCE = "public/unisphereLogo.png";
const RES = "android/app/src/main/res";
const IVORY = { r: 251, g: 246, b: 236, alpha: 1 }; // the same tile as the web app icons (scripts/generate-icons.mjs)
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const logo = (size) => sharp(SOURCE).resize(size, size, { fit: "contain", background: CLEAR }).png().toBuffer();
const solid = (size, background) => sharp({ create: { width: size, height: size, channels: 4, background } });
const write = (file, buffer) => {
  mkdirSync(file.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
  return sharp(buffer).toFile(file).then(() => console.log(`wrote ${file}`));
};
/** The logo's silhouette: white where the logo is, transparent elsewhere. */
async function silhouette(size, inner) {
  const mask = await sharp(await logo(inner)).extractChannel("alpha").toBuffer();
  const white = await sharp({ create: { width: inner, height: inner, channels: 3, background: { r: 255, g: 255, b: 255 } } }).joinChannel(mask).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: CLEAR } }).composite([{ input: white, gravity: "center" }]).png().toBuffer();
}
const circle = (size) => Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
const roundedSquare = (size) => Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#fff"/></svg>`);
const clip = async (buffer, mask) => sharp(buffer).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();

for (const [name, d] of Object.entries(DENSITIES)) {
  // Adaptive icon layers are 108dp; the OS shows the middle 66dp, so the logo stays inside about 56% of the layer.
  const layer = Math.round(108 * d);
  const inner = Math.round(layer * 0.56);
  await write(
    `${RES}/mipmap-${name}/ic_launcher_foreground.png`,
    await sharp({ create: { width: layer, height: layer, channels: 4, background: CLEAR } }).composite([{ input: await logo(inner), gravity: "center" }]).png().toBuffer(),
  );
  await write(`${RES}/mipmap-${name}/ic_launcher_monochrome.png`, await silhouette(layer, inner));

  // Pre-Android-8 launchers draw the icon as is: an ivory tile with the logo on it.
  const legacy = Math.round(48 * d);
  const tile = await solid(legacy, IVORY).composite([{ input: await logo(Math.round(legacy * 0.78)), gravity: "center" }]).png().toBuffer();
  await write(`${RES}/mipmap-${name}/ic_launcher.png`, await clip(tile, roundedSquare(legacy)));
  await write(`${RES}/mipmap-${name}/ic_launcher_round.png`, await clip(tile, circle(legacy)));

  // The status-bar icon: 24dp, white on transparent.
  const stat = Math.round(24 * d);
  await write(`${RES}/drawable-${name}/ic_stat_unisphere.png`, await silhouette(stat, stat));
}

// Splash icon: Android 12+ shows it in a circle 2/3 the size of this canvas, so the logo sits on its own ivory disc
// (the logo is dark navy and would vanish on the dark splash background otherwise).
const SPLASH = 960;
const disc = await clip(await solid(640, IVORY).png().toBuffer(), circle(640));
await write(
  `${RES}/drawable-nodpi/splash_icon.png`,
  await sharp({ create: { width: SPLASH, height: SPLASH, channels: 4, background: CLEAR } })
    .composite([{ input: disc, gravity: "center" }, { input: await logo(420), gravity: "center" }])
    .png()
    .toBuffer(),
);

// Launcher XML (adaptive icon with a themed monochrome layer for Android 13+) and the colour it sits on.
const LAUNCHER_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
writeFileSync(`${RES}/mipmap-anydpi-v26/ic_launcher.xml`, LAUNCHER_XML);
writeFileSync(`${RES}/mipmap-anydpi-v26/ic_launcher_round.xml`, LAUNCHER_XML);
writeFileSync(
  `${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FBF6EC</color>
</resources>
`,
);
console.log("wrote launcher XML");

// Leftovers of Capacitor's default icon and splash that nothing references any more.
for (const leftover of ["drawable/ic_launcher_background.xml", "drawable-v24/ic_launcher_foreground.xml", "drawable/splash.png"]) rmSync(`${RES}/${leftover}`, { force: true });
for (const dir of ["land", "port"]) for (const name of Object.keys(DENSITIES)) rmSync(`${RES}/drawable-${dir}-${name}`, { recursive: true, force: true });
