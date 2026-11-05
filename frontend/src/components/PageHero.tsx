import { useEffect, useRef, type ReactNode } from "react";

interface PageHeroProps {
  kicker?: string;
  title: string;
  description?: string;
  videoSrc: string;
  webmSrc?: string;
  posterSrc?: string;
  actions?: ReactNode;
  compact?: boolean;
}

export default function PageHero({
  kicker,
  title,
  description,
  videoSrc,
  webmSrc,
  posterSrc,
  actions,
  compact = false,
}: PageHeroProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const v = ref.current;
    if (!v || reduce) return;
    v.play().catch(() => {});
  }, [reduce, videoSrc, webmSrc]);

  useEffect(() => () => {
    const v = ref.current;
    if (!v) return;
    v.pause();
    window.setTimeout(() => {
      if (v.isConnected) return;
      v.removeAttribute("src");
      v.querySelectorAll("source").forEach((n) => n.remove());
      v.load();
    }, 0);
  }, []);

  return (
    <section className={`subpage-hero ${compact ? "compact-hero" : ""}`} aria-label={title}>
      <div className="subpage-hero-bg">
        <video
          ref={ref}
          muted
          playsInline
          loop
          autoPlay
          preload={reduce ? "none" : "metadata"}
          poster={posterSrc}
          aria-hidden="true"
          tabIndex={-1}
          onError={(e) => {
            // Graceful fallback to background poster/scrim if video playback fails
            (e.currentTarget as HTMLElement).style.display = "none";
          }}
        >
          {webmSrc && <source src={webmSrc} type="video/webm" />}
          <source src={videoSrc} type="video/mp4" />
        </video>
        <div className="subpage-hero-overlay" />
      </div>

      <div className="wrap subpage-hero-inner">
        {kicker && <div className="subpage-kicker">{kicker}</div>}
        <h1 className="subpage-title">{title}</h1>
        {description && <p className="subpage-desc">{description}</p>}
        {actions && <div className="subpage-actions">{actions}</div>}
      </div>
    </section>
  );
}
