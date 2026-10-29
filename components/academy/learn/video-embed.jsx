import { videoSource } from "@/lib/academy/video";

/** A lesson video from one of the two allowed providers. An invalid pair renders nothing. The page's policy frames only these hosts. */
export function VideoEmbed({ provider, videoRef, title }) {
  const src = videoSource(provider, videoRef);
  if (!src) return null;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[var(--ac-ink)] shadow-lg">
      <iframe
        src={src.src}
        title={title ? `Video: ${title}` : "Lesson video"}
        loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
        className="absolute inset-0 size-full border-0"
      />
    </div>
  );
}
