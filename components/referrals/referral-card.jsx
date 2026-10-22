"use client";

import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildShareText } from "@/lib/referrals/core";
import { useCanShare } from "@/lib/referrals/use-can-share";

const W = 1080;
const H = 1350;
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const shortUrl = (url) => url.replace(/^https?:\/\//, "");

/**
 * The invite card, drawn from the member's real code and link. It is an ordinary inline SVG: nothing is uploaded or hosted, so
 * no address anywhere contains the code or the member's name. It becomes a PNG only on the member's own device, when they
 * choose to save or share it.
 */
function CardSvg({ svgRef, code, url, name }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const g = (n) => `${n}-${uid}`;
  const u = (n) => `url(#${g(n)})`;
  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto w-full rounded-2xl" role="img"
      aria-label={`Invite card: Invite friends, earn 100 Orbits. Your invite code is ${code}.`} focusable="false">
      <defs>
        <linearGradient id={g("bg")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0a1130" /><stop offset="0.55" stopColor="#191c5a" /><stop offset="1" stopColor="#3a2380" />
        </linearGradient>
        <linearGradient id={g("ring")} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#60a5fa" /><stop offset="1" stopColor="#c084fc" /></linearGradient>
        <linearGradient id={g("coin")} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fde68a" /><stop offset="1" stopColor="#f59e0b" /></linearGradient>
        <radialGradient id={g("glow")} cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#818cf8" stopOpacity="0.5" /><stop offset="1" stopColor="#818cf8" stopOpacity="0" /></radialGradient>
        <radialGradient id={g("pl")} cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#bfdbfe" /><stop offset="0.45" stopColor="#4f46e5" /><stop offset="1" stopColor="#1e1b4b" /></radialGradient>
      </defs>
      <rect width={W} height={H} fill={u("bg")} />
      <circle cx="540" cy="560" r="430" fill={u("glow")} />
      <g fill="none" stroke={u("ring")}>
        <ellipse cx="540" cy="600" rx="560" ry="170" transform="rotate(-14 540 600)" strokeWidth="2.5" opacity="0.5" />
        <ellipse cx="540" cy="600" rx="440" ry="120" transform="rotate(-14 540 600)" strokeWidth="2" opacity="0.35" strokeDasharray="3 14" strokeLinecap="round" />
        <ellipse cx="540" cy="600" rx="330" ry="82" transform="rotate(-14 540 600)" strokeWidth="1.5" opacity="0.28" />
      </g>
      <circle cx="140" cy="720" r="58" fill={u("pl")} />
      <ellipse cx="140" cy="720" rx="96" ry="20" transform="rotate(-20 140 720)" fill="none" stroke="#a5b4fc" strokeOpacity="0.55" strokeWidth="5" />
      {[[120, 150], [900, 110], [980, 380], [70, 520], [930, 1180], [520, 1290], [330, 90]].map(([x, y], i) => (
        <path key={i} d="M0 -12 L3.5 -3.5 L12 0 L3.5 3.5 L0 12 L-3.5 3.5 L-12 0 L-3.5 -3.5 Z" transform={`translate(${x} ${y}) scale(${0.8 + (i % 3) * 0.3})`} fill="#e0e7ff" opacity="0.8" />
      ))}

      <g fontFamily={FONT} textAnchor="middle">
        <text x="540" y="150" fontSize="40" fontWeight="800" fill="#e0e7ff" letterSpacing="2">UniSphere</text>
        <text x="540" y="260" fontSize="92" fontWeight="800" fill="#ffffff">Invite friends.</text>
        <text x="540" y="368" fontSize="92" fontWeight="800" fill="#fde68a">Earn 100 Orbits.</text>

        <g transform="translate(540 590)">
          <circle r="150" fill={u("coin")} stroke="#b45309" strokeWidth="8" />
          <circle r="112" fill="none" stroke="#b45309" strokeOpacity="0.4" strokeWidth="6" />
          <text y="30" fontSize="92" fontWeight="800" fill="#78350f">+100</text>
        </g>

        {name && <text x="540" y="860" fontSize="42" fontWeight="700" fill="#e0e7ff">{clip(name, 26)} invites you to join</text>}
        <text x="540" y={name ? 920 : 880} fontSize="34" fontWeight="500" fill="#a5b4fc">Connect with students, discover opportunities</text>
        <text x="540" y={name ? 964 : 924} fontSize="34" fontWeight="500" fill="#a5b4fc">and build your community.</text>

        <rect x="190" y="1010" width="700" height="130" rx="30" fill="#ffffff" fillOpacity="0.1" stroke="#818cf8" strokeWidth="3" />
        <text x="540" y="1058" fontSize="26" fontWeight="700" fill="#a5b4fc" letterSpacing="3">INVITE CODE</text>
        <text x="540" y="1118" fontSize={Math.max(30, Math.min(58, Math.floor(1250 / code.length)))} fontWeight="800" fill="#ffffff" letterSpacing="1">{code}</text>

        <text x="540" y="1210" fontSize="30" fontWeight="600" fill="#c7d2fe">{shortUrl(url)}</text>
        <text x="540" y="1286" fontSize="24" fill="#818cf8">You earn Orbits when a friend becomes an active member. Orbits have no cash value.</text>
      </g>
    </svg>
  );
}

async function svgToPng(svgEl) {
  const xml = new XMLSerializer().serializeToString(svgEl);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.getContext("2d").drawImage(img, 0, 0, W, H);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png failed"))), "image/png"));
}

export function ReferralCardPanel({ code, url, name = null }) {
  const svgRef = useRef(null);
  const [busy, setBusy] = useState(null);
  const canShareFiles = useCanShare({ files: true });

  async function make() {
    if (!svgRef.current) throw new Error("no card");
    return svgToPng(svgRef.current);
  }

  async function save() {
    setBusy("save");
    try {
      const blob = await make();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = "unisphere-invite.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
      toast.success("Card saved to your downloads.");
    } catch {
      toast.error("Could not create the card. Copy your link instead.");
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    setBusy("share");
    try {
      const blob = await make();
      const file = new File([blob], "unisphere-invite.png", { type: "image/png" });
      const text = buildShareText(url);
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else await navigator.share({ title: "Join me on UniSphere", text, url });
    } catch (err) {
      if (err?.name !== "AbortError") toast.error("Sharing the card is not available here. Save it instead.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xs space-y-3">
      <CardSvg svgRef={svgRef} code={code} url={url} name={name} />
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={save} disabled={busy !== null}>
          {busy === "save" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />} Save card
        </Button>
        {canShareFiles && (
          <Button type="button" variant="outline" size="sm" onClick={share} disabled={busy !== null}>
            {busy === "share" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Share2 aria-hidden="true" />} Share card
          </Button>
        )}
      </div>
    </div>
  );
}
