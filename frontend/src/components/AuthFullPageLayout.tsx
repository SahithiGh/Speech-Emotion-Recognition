import { useEffect, useRef, type ReactNode } from "react";

interface AuthFullPageLayoutProps {
  kicker?: string;
  title: string;
  description?: string;
  videoSrc?: string;
  posterSrc?: string;
  maxWidth?: string;
  children: ReactNode;
}

export default function AuthFullPageLayout({
  kicker,
  title,
  description,
  videoSrc = "/media/video-lotus-glow.mp4",
  posterSrc = "/media/hero-poster.jpg",
  maxWidth = "440px",
  children,
}: AuthFullPageLayoutProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const v = ref.current;
    if (!v || reduce) return;
    v.play().catch(() => {});
  }, [reduce, videoSrc]);

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
    <div className="auth-fullpage-view">
      {/* 1. Full-page background video spanning navbar to viewport bottom */}
      <div className="auth-fullpage-video-bg">
        <video
          ref={ref}
          muted
          playsInline
          loop
          autoPlay
          preload={reduce ? "none" : "metadata"}
          poster={posterSrc}
          className="auth-fullpage-video"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
        <div className="auth-fullpage-overlay" />
      </div>

      {/* 2. Centered foreground card */}
      <div className="auth-fullpage-container" style={{ maxWidth }}>
        <div className="auth-card">
          <div className="auth-card-header">
            {kicker && <span className="auth-card-kicker">{kicker}</span>}
            <h1 className="auth-card-title">{title}</h1>
            {description && <p className="auth-card-subtitle">{description}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

