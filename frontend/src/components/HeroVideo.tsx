import { useEffect, useRef } from "react";

/** Full-bleed background footage. It loops seamlessly, is never filtered or tinted,
 *  is skipped for people who prefer reduced motion. The poster is the first frame. */
export default function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches;

  useEffect(() => {
    const v = ref.current;
    if (!v || reduce) return;
    v.play().catch(() => {});
  }, [reduce]);

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
    <video
      ref={ref}
      key={small ? "s" : "l"}
      muted
      playsInline
      loop
      autoPlay
      preload={reduce ? "none" : "auto"}
      poster="/media/hero-poster.jpg"
      aria-hidden="true"
      tabIndex={-1}
      className="hero-video-element"
    >
      <source src={small ? "/media/hero-720.mp4" : "/media/hero.mp4"} type="video/mp4" />
      <source src={small ? "/media/hero-720.webm" : "/media/hero.webm"} type="video/webm" />
    </video>
  );
}
