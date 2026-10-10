import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

let logoData;
async function logo() {
  if (logoData === undefined) {
    try {
      // Bundled as an asset, so it also works on serverless hosts where public/ is not on the function's disk.
      const bytes = Buffer.from(await (await fetch(new URL("../public/logo-mark.png", import.meta.url))).arrayBuffer());
      logoData = `data:image/png;base64,${bytes.toString("base64")}`;
    } catch {
      logoData = null; // the card still renders, just without the mark
    }
  }
  return logoData;
}

const clip = (s, n) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/**
 * The social-preview card: brand mark, a small label, a big title and a byline. Only text that is already public
 * is ever passed in. Callers use an anonymous client, so a private record simply yields the generic card.
 */
export async function ogImage({ label = "Ramgarh Engineering College", title, byline }) {
  const mark = await logo();
  const long = (title ?? "").length > 70;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#FBF6EC", color: "#1B1812", padding: "64px 72px", borderLeft: "16px solid #FF5A36" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- satori (ImageResponse) renders plain <img> only */}
          {mark && <img src={mark} width={64} height={64} alt="" />}
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800 }}>UniSphere</div>
          <div style={{ display: "flex", marginLeft: 12, padding: "6px 16px", borderRadius: 8, background: "#FFC83D", color: "#1B1812", fontSize: 24, fontWeight: 700 }}>{clip(label, 40)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: long ? 56 : 74, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5 }}>{clip(title || "Your campus. Your people. Your next idea.", 120)}</div>
          {byline && <div style={{ display: "flex", fontSize: 30, color: "#675F52" }}>{clip(byline, 90)}</div>}
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#675F52" }}>The campus network of Ramgarh Engineering College</div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
