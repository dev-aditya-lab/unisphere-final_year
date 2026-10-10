// Captures store-listing screenshots of the running app using the fictional demo community.
//   npm run seed:demo                       (once)
//   npm run build && npm start              (a production build has no dev overlay)
//   BASE_URL=http://localhost:3000 npm run screenshots
// Output: store/screenshots/{android-phone,ios-6.7}/NN-name.png and store/screenshots/play-feature-graphic.png
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PASSWORD = "Demo-Pass-2026!";
const SETS = [
  { dir: "android-phone", width: 360, height: 640, scale: 3 }, // 1080 x 1920 (Google Play phone)
  { dir: "ios-6.7", width: 430, height: 932, scale: 3 }, // 1290 x 2796 (App Store 6.7-inch)
];

const browser = await chromium.launch();

async function shots({ dir, width, height, scale }) {
  mkdirSync(`store/screenshots/${dir}`, { recursive: true });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, isMobile: true, hasTouch: true, colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  let n = 0;
  const snap = async (name, path, { fullPage = false, wait } = {}) => {
    await page.goto(`${base}${path}`);
    await page.waitForLoadState("networkidle");
    if (wait) await page.locator(wait).first().waitFor({ timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `store/screenshots/${dir}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage });
    console.log(`  ${dir}/${String(n).padStart(2, "0")}-${name}.png`);
  };

  await snap("welcome", "/");
  await snap("roadmap", "/roadmap");

  await page.goto(`${base}/login`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill("demo.ananya@demo.unisphere.test");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/feed/, { timeout: 30_000 });

  await snap("feed", "/feed", { wait: "article" });
  await snap("project", "/projects/qr-attendance-demo");
  await snap("event", "/events/web-dev-workshop-demo");
  await page.goto(`${base}/messages`);
  await page.waitForLoadState("networkidle");
  const first = page.getByRole("link", { name: /Priya Kumari/ }).first();
  if (await first.count()) {
    await first.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `store/screenshots/${dir}/${String(++n).padStart(2, "0")}-messages.png` });
    console.log(`  ${dir}/${String(n).padStart(2, "0")}-messages.png`);
  }
  await snap("explore", "/explore");
  await context.close();
}

for (const set of SETS) {
  console.log(`Capturing ${set.dir} (${set.width * set.scale}x${set.height * set.scale})`);
  await shots(set);
}

// Google Play feature graphic: 1024 x 500
const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`${base}/`);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: "store/screenshots/play-feature-graphic.png" });
console.log("  play-feature-graphic.png");
await browser.close();
